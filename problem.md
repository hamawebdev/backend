13 [server 4/9] COPY --from=builder /app/prisma ./prisma
#13 CACHED
#14 [server 5/9] COPY --from=builder /app/src/infra/database/migrations ./src/infra/database/migrations
#14 ERROR: failed to calculate checksum of ref ma3jtumwwc1ihd2rtdv05owv4::o13jciqtwxh7enjwm11h488ug: "/app/src/infra/database/migrations": not found
#15 [server 6/9] COPY --from=builder /app/src/infra/database/config ./src/infra/database/config
#15 ERROR: failed to calculate checksum of ref ma3jtumwwc1ihd2rtdv05owv4::o13jciqtwxh7enjwm11h488ug: "/app/src/infra/database/config": not found
------
> [server 5/9] COPY --from=builder /app/src/infra/database/migrations ./src/infra/database/migrations:
------
------
> [server 6/9] COPY --from=builder /app/src/infra/database/config ./src/infra/database/config:
------
Dockerfile:55
--------------------
|     # Copy source migrations and config so Drizzle can generate meta
|     COPY --from=builder /app/src/infra/database/migrations ./src/infra/database/migrations
| >>> COPY --from=builder /app/src/infra/database/config ./src/infra/database/config
|
|     # Copy package.json to install production deps
--------------------
ERROR: failed to build: failed to solve: failed to compute cache key: failed to calculate checksum of ref ma3jtumwwc1ihd2rtdv05owv4::o13jciqtwxh7enjwm11h488ug: "/app/src/infra/database/config": not found
❌ Docker build failed
Error occurred ❌, check the logs for details.