2026-02-07T16:24:04.071Z > med-adn-backend@1.0.0 start:prod
2026-02-07T16:24:04.071Z > node build/app.js
2026-02-07T16:24:04.543Z Server is running on http://0.0.0.0:8080
2026-02-07T16:25:26.849Z Login error: PrismaClientKnownRequestError:
2026-02-07T16:25:26.849Z Invalid `prisma.user.findUnique()` invocation:
2026-02-07T16:25:26.849Z The table `public.users` does not exist in the current database.
2026-02-07T16:25:26.849Z at ei.handleRequestError (/app/node_modules/@prisma/client/runtime/library.js:121:7268)
2026-02-07T16:25:26.849Z at ei.handleAndLogRequestError (/app/node_modules/@prisma/client/runtime/library.js:121:6593)
2026-02-07T16:25:26.849Z at ei.request (/app/node_modules/@prisma/client/runtime/library.js:121:6300)
2026-02-07T16:25:26.849Z at async a (/app/node_modules/@prisma/client/runtime/library.js:130:9551) {
2026-02-07T16:25:26.849Z code: 'P2021',
2026-02-07T16:25:26.849Z meta: { modelName: 'User', table: 'public.users' },
2026-02-07T16:25:26.849Z clientVersion: '6.19.2'
2026-02-07T16:25:26.849Z }
2026-02-07T16:25:26.850Z Error occurred: InternalServerError: We're experiencing technical difficulties. Please try again later.
2026-02-07T16:25:26.850Z at AuthService.<anonymous> (/app/build/modules/auth/auth.service.js:115:23)
2026-02-07T16:25:26.850Z at Generator.throw (<anonymous>)
2026-02-07T16:25:26.850Z at rejected (/app/build/modules/auth/auth.service.js:18:65) {
2026-02-07T16:25:26.850Z statusCode: 500,
2026-02-07T16:25:26.850Z details: undefined,
2026-02-07T16:25:26.850Z isOperational: true,
2026-02-07T16:25:26.850Z code: undefined
2026-02-07T16:25:26.850Z }
2026-02-07T16:25:26.855Z [0mPOST /api/v1/auth/login [31m500[0m 85.022 ms - 210[0m