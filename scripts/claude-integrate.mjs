// Adaptador GitHub da INTEGRAÇÃO (política de 04/10/2026). Control plane.
//
// Usado SOMENTE pelo runner (processo do proprietário, fora da sessão do agente): o agente continua sem verbo de ready-for-review nem de
// merge (`claude-git.mjs` não os tem e o guard não os permite). A decisão é de `claude-gates.mjs`; este módulo só executa e lê.
//   - só `api.github.com`, lista FECHADA de endpoints, repositório único, corpo das escritas montado aqui (nunca vindo do agente);
//   - token de instalação com o mapa EXATO de permissões e um único repositório (as mesmas do App de entrega);
//   - merge: sempre `squash` com `sha` esperado (o GitHub recusa com 409 se o head mudou) e nunca force/branch delete;
//   - ready-for-review: mutação GraphQL fixa;
//   - toda falha de rede é distinguida de recusa: o runner relê o estado antes de repetir uma escrita.
// Nunca imprime token, chave ou corpo bruto de resposta.

import { EXPECTED_PERMISSIONS, REPO_NAME, defaultHttp, defaultKeys, signJwt, untrusted } from "./claude-git.mjs";
import { REPOSITORY } from "./claude-delivery-record.mjs";

export class IntegrateError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}
const fail = (code, detail) => {
  throw new IntegrateError(code, detail);
};

const R = REPOSITORY;
const OWNER = REPOSITORY.split("/")[0];
const ENDPOINTS = Object.freeze([
  ["POST", /^\/app\/installations\/\d+\/access_tokens$/],
  ["GET", new RegExp(`^/repos/${R}/rules/branches/main$`)],
  ["GET", new RegExp(`^/repos/${R}/pulls\\?head=${OWNER}:agent/[a-z0-9/-]{3,120}&state=all&per_page=5$`)],
  ["GET", new RegExp(`^/repos/${R}/pulls/\\d+$`)],
  ["GET", new RegExp(`^/repos/${R}/pulls/\\d+/files\\?per_page=100&page=[1-4]$`)],
  ["GET", new RegExp(`^/repos/${R}/pulls/\\d+/reviews\\?per_page=100$`)],
  ["GET", new RegExp(`^/repos/${R}/commits/[0-9a-f]{40}/check-runs\\?per_page=100$`)],
  ["PUT", new RegExp(`^/repos/${R}/pulls/\\d+/merge$`)],
  ["PUT", new RegExp(`^/repos/${R}/pulls/\\d+/update-branch$`)],
  ["POST", /^\/graphql$/],
]);
export function integrateEndpointAllowed(method, urlPath) {
  return ENDPOINTS.some(([m, re]) => m === method && re.test(urlPath));
}

export const READY_MUTATION = "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{number isDraft}}}";
export const DRAFT_MUTATION = "mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{number isDraft}}}";
const BRANCH = /^agent\/[a-z0-9/-]{3,120}$/;
const SHA = /^[0-9a-f]{40}$/;
const TITLE = /^(feat|fix|docs|chore|test|refactor|ci|build|perf|revert)(\([a-z0-9-]+\))?!?: \S.{0,120}$/;

function samePermissions(actual) {
  if (!actual || typeof actual !== "object") return false;
  const a = Object.keys(actual).sort();
  const e = Object.keys(EXPECTED_PERMISSIONS).sort();
  return a.length === e.length && a.every((k, i) => k === e[i] && actual[k] === EXPECTED_PERMISSIONS[k]);
}

/**
 * Cliente de integração. `ports`: `http(req)`, `keys()`, `now()`. O token é emitido sob demanda, uma vez por instância, e jamais impresso.
 */
export function createIntegrator({ http = defaultHttp(), keys = defaultKeys(), now = () => new Date(), beforeEffect = () => {} } = {}) {
  let token = null;
  let tokenExpiresAt = 0;
  const secrets = new Set();

  async function call(method, urlPath, { body, auth = "token" } = {}) {
    if (!integrateEndpointAllowed(method, urlPath)) fail("endpoint");
    if (method !== "GET") beforeEffect();
    const bearer = auth === "jwt" ? signJwt(creds(), Math.floor(now().getTime() / 1000)) : token;
    if (!bearer) fail("permissions");
    secrets.add(bearer);
    try {
      return await http({
        method,
        path: urlPath,
        headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "oplyra-runner", Authorization: `Bearer ${bearer}` },
        body,
      });
    } catch {
      fail("network", `${method} sem resposta`);
    }
    return null;
  }

  let cachedKeys = null;
  const creds = () => {
    cachedKeys ??= keys();
    secrets.add(cachedKeys.privateKey);
    return cachedKeys;
  };

  async function ensureToken() {
    if (token && now().getTime() < tokenExpiresAt - 60_000) return;
    const k = creds();
    const res = await call("POST", `/app/installations/${k.installationId}/access_tokens`, { auth: "jwt", body: { repositories: [REPO_NAME], permissions: { ...EXPECTED_PERMISSIONS } } });
    const j = res.json;
    if (res.status !== 201 || !j || typeof j.token !== "string") fail("token", `status ${res.status}`);
    secrets.add(j.token);
    const repos = Array.isArray(j.repositories) ? j.repositories : [];
    if (j.repository_selection !== "selected" || repos.length !== 1 || String(repos[0]?.full_name).toLowerCase() !== REPOSITORY || !samePermissions(j.permissions)) fail("permissions");
    token = j.token;
    tokenExpiresAt = Number.isFinite(Date.parse(j.expires_at)) ? Date.parse(j.expires_at) : now().getTime() + 45 * 60_000;
  }

  const get = async (urlPath) => {
    await ensureToken();
    return call("GET", urlPath);
  };

  return {
    secrets,
    /** Cabeçalho de autenticação para `git fetch` do runner (a mesma forma do wrapper de entrega): token só no ambiente do filho Git. */
    async gitAuth() {
      await ensureToken();
      const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
      secrets.add(basic);
      return { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` };
    },
    /** Regras efetivas de `main` (para `assessRuleset`). */
    async readRules() {
      const res = await get(`/repos/${R}/rules/branches/main`);
      if (res.status !== 200 || !Array.isArray(res.json)) fail("rules", `status ${res.status}`);
      return res.json;
    },
    /** PR (aberto ou não) da branch da missão. No máximo um; mais de um é inconsistência (nunca escolher). */
    async findPrByBranch(branch) {
      if (!BRANCH.test(branch)) fail("branch");
      const res = await get(`/repos/${R}/pulls?head=${OWNER}:${branch}&state=all&per_page=5`);
      if (res.status !== 200 || !Array.isArray(res.json)) fail("http", `pulls ${res.status}`);
      if (res.json.length > 1) fail("duplicate-pr", String(res.json.length));
      return res.json[0] ? normalizePr(res.json[0]) : null;
    },
    async readPr(number) {
      const res = await get(`/repos/${R}/pulls/${intOf(number)}`);
      if (res.status !== 200 || !res.json) fail("http", `pull ${res.status}`);
      return normalizePr(res.json);
    },
    async readFiles(number) {
      const out = [];
      for (let page = 1; page <= 4; page += 1) {
        const res = await get(`/repos/${R}/pulls/${intOf(number)}/files?per_page=100&page=${page}`);
        if (res.status !== 200 || !Array.isArray(res.json)) fail("http", `files ${res.status}`);
        for (const f of res.json) {
          out.push({ path: String(f.filename), status: String(f.status) });
          // renomeação e cópia contam os DOIS caminhos: o de origem também foi tocado
          if (typeof f.previous_filename === "string") out.push({ path: f.previous_filename, status: "removed" });
        }
        if (res.json.length < 100) return out;
      }
      // mais de 400 arquivos: grande demais para a integração automática (o gate manda para o proprietário)
      return [...out, ...Array.from({ length: 1 }, () => ({ path: "(muitos-arquivos)", status: "modified" }))];
    },
    async readReviews(number) {
      const res = await get(`/repos/${R}/pulls/${intOf(number)}/reviews?per_page=100`);
      if (res.status !== 200 || !Array.isArray(res.json)) fail("http", `reviews ${res.status}`);
      return res.json.map((r) => ({ state: r.state, user: r.user?.login, commit_id: r.commit_id, submitted_at: r.submitted_at }));
    },
    async readChecks(sha) {
      if (!SHA.test(sha)) fail("sha");
      const res = await get(`/repos/${R}/commits/${sha}/check-runs?per_page=100`);
      if (res.status !== 200 || !Array.isArray(res.json?.check_runs)) fail("http", `check-runs ${res.status}`);
      return res.json.check_runs.map((c) => ({ name: String(c.name), status: String(c.status), conclusion: c.conclusion ?? null }));
    },
    /** draft → ready-for-review por GraphQL (a REST não expõe a transição). Confirma `isDraft === false`. */
    async markReady(nodeId) {
      if (typeof nodeId !== "string" || !/^[A-Za-z0-9_=-]{8,100}$/.test(nodeId)) fail("node-id");
      await ensureToken();
      const res = await call("POST", "/graphql", { body: { query: READY_MUTATION, variables: { id: nodeId } } });
      const pr = res.json?.data?.markPullRequestReadyForReview?.pullRequest;
      if (res.status !== 200 || res.json?.errors || !pr || pr.isDraft !== false) fail("ready", `status ${res.status}`);
      return true;
    },
    /** Volta a draft antes de corrigir CI que falhou depois de ready; preserva os gates dos wrappers. */
    async markDraft(nodeId) {
      if (typeof nodeId !== "string" || !/^[A-Za-z0-9_=-]{8,100}$/.test(nodeId)) fail("node-id");
      await ensureToken();
      const res = await call("POST", "/graphql", { body: { query: DRAFT_MUTATION, variables: { id: nodeId } } });
      const pr = res.json?.data?.convertPullRequestToDraft?.pullRequest;
      if (res.status !== 200 || res.json?.errors || !pr || pr.isDraft !== true) fail("draft", `status ${res.status}`);
      return true;
    },
    /** Squash do PR no `sha` esperado. 409 = head mudou (evidência invalidada); 405 = não integrável; 200 com `merged:true` = pedido aceito. */
    async merge(number, { sha, title, message }) {
      if (!SHA.test(sha) || !TITLE.test(title)) fail("merge-args");
      await ensureToken();
      const res = await call("PUT", `/repos/${R}/pulls/${intOf(number)}/merge`, { body: { merge_method: "squash", sha, commit_title: `${title} (#${intOf(number)})`.slice(0, 200), commit_message: String(message).slice(0, 1000) } });
      if (res.status === 200 && res.json?.merged === true) return { merged: true, sha: res.json.sha ?? null };
      if (res.status === 409) fail("head-moved");
      if (res.status === 405 || res.status === 422) fail("not-mergeable", untrusted(res.json?.message));
      fail("http", `merge ${res.status}`);
      return null;
    },
    /** Atualiza a branch com a base (quando `behind`) preservando o head esperado; gera um SHA novo. */
    async updateBranch(number, expectedHeadSha) {
      if (!SHA.test(expectedHeadSha)) fail("sha");
      await ensureToken();
      const res = await call("PUT", `/repos/${R}/pulls/${intOf(number)}/update-branch`, { body: { expected_head_sha: expectedHeadSha } });
      if (res.status !== 202) fail("update-branch", `status ${res.status}`);
      return true;
    },
  };
}

function intOf(n) {
  if (!Number.isSafeInteger(n) || n < 1) fail("pr-number");
  return n;
}

function normalizePr(p) {
  return {
    number: p.number,
    node_id: p.node_id,
    state: p.state,
    draft: p.draft === true,
    merged: p.merged === true || (typeof p.merged_at === "string" && p.merged_at.length > 0),
    merge_commit_sha: p.merge_commit_sha ?? null,
    title: String(p.title ?? ""),
    author: p.user?.login ?? null,
    labels: Array.isArray(p.labels) ? p.labels.map((l) => String(l?.name ?? "")) : [],
    mergeable_state: p.mergeable_state ?? "unknown",
    head: { sha: p.head?.sha, ref: p.head?.ref, repo: { full_name: p.head?.repo?.full_name } },
    base: { ref: p.base?.ref },
  };
}
