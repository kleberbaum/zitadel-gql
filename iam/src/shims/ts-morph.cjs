// Empty stand-in for ts-morph, see the alias in wrangler.toml.
// Pylon's dist statically reaches its build-time chunk, which imports
// ts-morph. That code never runs inside the deployed Worker, but wrangler's
// bundler still has to resolve the specifier. CJS on purpose, so esbuild
// does not validate named imports against this module.
module.exports = {}
