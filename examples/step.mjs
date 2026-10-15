// Fictional demo steps. Real builds and tests belong in your own commands.
const [name, delay = '20', exitCode = '0'] = process.argv.slice(2);
await new Promise(resolve => setTimeout(resolve, Number(delay)));
console.log(`Demo step ${name} finished.`);
process.exitCode = Number(exitCode);
