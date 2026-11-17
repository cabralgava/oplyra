// Não imprimir erros/attachments/call logs: eles podem conter valores de fill/cookies.
export default class HostedSafeReporter {
  constructor() { this.results = []; }
  onTestEnd(test, result) { this.results.push({ title: test.title, status: result.status }); }
  onError() {}
  onStdOut() {}
  onStdErr() {}
  printsToStdio() { return false; }
  onEnd(result) {
    const counts = {};
    for (const item of this.results) counts[item.status] = (counts[item.status] ?? 0) + 1;
    const complete = result.status === 'passed' && !counts.skipped && this.results.length === 8;
    console.log(JSON.stringify({ target:'oplyra-develop', counts, complete }));
    return {status: complete ? 'passed' : 'failed'};
  }
}
