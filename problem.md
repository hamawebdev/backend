#12 1.856    Creating an optimized production build ...
#12 40.17 Failed to compile.
#12 40.17
#12 40.17 ./src/app/payments/success/page.tsx
#12 40.17 Error:   x Expected a semicolon
#12 40.17     ,-[/app/src/app/payments/success/page.tsx:55:1]
#12 40.17  52 |             console.error('❌ PaymentSuccess: Token refresh failed:', error);
#12 40.17  53 |
#12 40.17  54 |             // Default user-facing message per requirements
#12 40.17  55 |             let errorMessage = 'Impossible d'actualiser la session.Veuillez réessayer.';
#12 40.17     :                                              ^^^^^^^^^^
#12 40.17  56 |
#12 40.17  57 |             // Increment retry counter (manual retries only)
#12 40.17  58 |             setRetryCount(prev => prev + 1);
#12 40.17     `----
#12 40.17   x Unterminated string constant
#12 40.17     ,-[/app/src/app/payments/success/page.tsx:55:1]
#12 40.17  52 |             console.error('❌ PaymentSuccess: Token refresh failed:', error);
#12 40.17  53 |
#12 40.17  54 |             // Default user-facing message per requirements
#12 40.17  55 |             let errorMessage = 'Impossible d'actualiser la session.Veuillez réessayer.';
#12 40.17     :                                                                                       ^^
#12 40.17  56 |
#12 40.17  57 |             // Increment retry counter (manual retries only)
#12 40.17  58 |             setRetryCount(prev => prev + 1);
#12 40.17     `----
#12 40.17
#12 40.17 Caused by:
#12 40.17     Syntax Error
#12 40.17
#12 40.17 Import trace for requested module:
#12 40.17 ./src/app/payments/success/page.tsx
#12 40.17
#12 40.17
#12 40.17 > Build failed because of webpack errors
#12 40.19 npm notice
#12 40.19 npm notice New major version of npm available! 10.9.4 -> 11.9.0
#12 40.19 npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.9.0
#12 40.19 npm notice To update run: npm install -g npm@11.9.0
#12 40.19 npm notice
#12 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1
------
> [builder 5/5] RUN npm run build:
40.17 Import trace for requested module:
40.17 ./src/app/payments/success/page.tsx
40.17
40.17
40.17 > Build failed because of webpack errors
40.19 npm notice
40.19 npm notice New major version of npm available! 10.9.4 -> 11.9.0
40.19 npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.9.0
40.19 npm notice To update run: npm install -g npm@11.9.0
40.19 npm notice
------
Dockerfile:24
--------------------
|     ENV NEXT_TELEMETRY_DISABLED=1
|
| >>> RUN npm run build
|
|     # Stage 3: Production runner
--------------------
failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1
Error: ❌ Docker command failed
Error occurred ❌, check the logs for details.