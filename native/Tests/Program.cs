using NUnitLite;

// Execute the same NUnit cases used by Unity EditMode in-process. This runner
// requires no local TCP testhost/data-collector connection or Unity license.
return new AutoRun().Execute(args);
