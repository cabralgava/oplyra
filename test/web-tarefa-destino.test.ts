import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { transform, loadBindings } = requireWeb("next/dist/build/swc");
await loadBindings();
const source = readFileSync(new URL("../apps/web/src/components/tarefa-destino.tsx", import.meta.url), "utf8");
const compiled = await transform(source, { filename: "tarefa-destino.tsx", jsc: { parser: { syntax: "typescript", tsx: true } }, module: { type: "commonjs" } });
let effect: (() => () => void) | undefined;
const exports: {
  TarefaDestino: (props: { taskIds: readonly string[] }) => null;
  tarefaPermitidaNoHash: (hash: string, permitidos: ReadonlySet<string>) => string | null;
} = {} as any;
new Function("require", "exports", compiled.code)((name: string) => {
  if (name !== "react") throw new Error(`Import não previsto: ${name}`);
  return { useEffect: (callback: () => () => void) => { effect = callback; } };
}, exports);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const FOREIGN = "33333333-3333-4333-8333-333333333333";
class Element {
  rect = { width: 320, height: 144 };
  inContainer = true;
  scrollIntoView = vi.fn();
  getBoundingClientRect() { return this.rect; }
  contains(node: Element) { return node.inContainer; }
}
class Mutations {
  static instances: Mutations[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(public callback: () => void) { Mutations.instances.push(this); }
}
class Resizes {
  static instances: Resizes[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(public callback: () => void) { Resizes.instances.push(this); }
}
let root: Element, target: Element, other: Element;
let elements: Map<string, Element>;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let listeners: Map<string, () => void>;
let location: { hash: string };
let getElementById: ReturnType<typeof vi.fn>;
let cancelAnimationFrame: ReturnType<typeof vi.fn>;
let cleanup: (() => void) | undefined;
function mount(ids: readonly string[] = [A]) {
  exports.TarefaDestino({ taskIds: ids });
  cleanup = effect!();
  return cleanup;
}
function flush() {
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(1);
}
function dispatch(type: string) { listeners.get(type)?.(); }

beforeEach(() => {
  root = new Element(); target = new Element(); other = new Element();
  elements = new Map([["conteudo-principal", root], [`tarefa-${A}`, target], [`tarefa-${B}`, other]]);
  frames = new Map(); nextFrame = 0; listeners = new Map(); location = { hash: `#tarefa-${A}` };
  getElementById = vi.fn((id: string) => elements.get(id) ?? null);
  cancelAnimationFrame = vi.fn((id: number) => { frames.delete(id); });
  Mutations.instances = []; Resizes.instances = [];
  vi.stubGlobal("HTMLElement", Element);
  vi.stubGlobal("document", { getElementById });
  vi.stubGlobal("MutationObserver", Mutations);
  vi.stubGlobal("ResizeObserver", Resizes);
  vi.stubGlobal("window", {
    location,
    requestAnimationFrame: (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame,
    addEventListener: (type: string, callback: () => void) => { listeners.set(type, callback); },
    removeEventListener: (type: string, callback: () => void) => { if (listeners.get(type) === callback) listeners.delete(type); },
  });
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });

describe("Destino de tarefa após hidratação — navegador controlado, sem temporizadores", () => {
  it("recusa hash malformado, codificado, de editor ou de ID alheio antes de qualquer busca", () => {
    for (const hash of ["", "#tarefas", "#editar-" + A, "#tarefa-invalido", "#tarefa-" + FOREIGN, "#tarefa-" + A + "?x=1", "#tarefa-%31" + A.slice(1)]) {
      location.hash = hash; mount(); flush(); cleanup!();
    }
    expect(getElementById).not.toHaveBeenCalled();
    expect(Mutations.instances).toHaveLength(0);
    expect(Resizes.instances).toHaveLength(0);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it("normaliza UUID válido somente quando pertence ao conjunto autorizado", () => {
    const id = "ab0cde00-abcd-4bcd-8bcd-abcdefabcdef";
    expect(exports.tarefaPermitidaNoHash("#tarefa-" + id.toUpperCase(), new Set([id]))).toBe("tarefa-" + id);
    expect(exports.tarefaPermitidaNoHash("#tarefa-" + id, new Set())).toBeNull();
  });

  it("rola uma vez ao alvo visível e encerra todos os observadores", () => {
    mount(); flush();
    expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start", behavior: "auto" });
    expect(Mutations.instances[0]!.disconnect).toHaveBeenCalled();
    expect(Resizes.instances[0]!.disconnect).toHaveBeenCalled();
    Mutations.instances[0]!.callback(); Resizes.instances[0]!.callback(); flush();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it("espera geometria zero virar visível pelo ResizeObserver, reproduzindo o stream", () => {
    target.rect = { width: 0, height: 0 };
    mount(); flush();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    expect(Resizes.instances[0]!.observe).toHaveBeenCalledWith(target);
    target.rect = { width: 320, height: 144 };
    Resizes.instances[0]!.callback(); flush();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("acompanha mudanças de visibilidade dos ancestrais sem observar fora do conteúdo", () => {
    target.rect = { width: 0, height: 0 };
    mount(); flush();
    expect(Mutations.instances[0]!.observe).toHaveBeenCalledWith(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class"] });
    target.rect = { width: 320, height: 144 };
    Mutations.instances[0]!.callback(); flush();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("espera o cartão ser inserido no conteúdo antes de navegar", () => {
    elements.delete("tarefa-" + A);
    mount(); flush();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    elements.set("tarefa-" + A, target);
    Mutations.instances[0]!.callback(); flush();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("não rola alvo com ID autorizado localizado fora do container de Operação", () => {
    target.inContainer = false;
    mount(); flush();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    expect(Resizes.instances[0]!.observe).not.toHaveBeenCalled();
  });

  it("hashchange/popstate cancelam a espera anterior e só aceitam o novo alvo permitido", () => {
    target.rect = { width: 0, height: 0 };
    mount([A, B]);
    const oldFrame = [...frames.values()][0]!;
    location.hash = "#tarefa-" + FOREIGN; dispatch("hashchange");
    expect(cancelAnimationFrame).toHaveBeenCalled();
    oldFrame(1);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    location.hash = "#tarefa-" + B; dispatch("popstate"); flush();
    expect(other.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it("limpa frames, observadores e listeners ao desmontar; callbacks tardios não agem", () => {
    mount(); const pending = [...frames.values()][0]!;
    cleanup!();
    expect(listeners.size).toBe(0);
    expect(frames.size).toBe(0);
    expect(Mutations.instances[0]!.disconnect).toHaveBeenCalled();
    expect(Resizes.instances[0]!.disconnect).toHaveBeenCalled();
    pending(1); Mutations.instances[0]!.callback(); Resizes.instances[0]!.callback(); flush();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it("IDs retirados nas props não conservam a navegação antiga pendente", () => {
    mount([A]); cleanup!();
    getElementById.mockClear();
    mount([B]); flush();
    expect(getElementById).not.toHaveBeenCalled();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });
});
