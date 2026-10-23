# Runbook

## Logs

Both services log one JSON object per line to stdout, and ECS ships it to CloudWatch:

- `/ecs/tidewell-api` for the API, in streams named `api/api/<task id>`
- `/ecs/tidewell-worker` for the worker, in streams named `worker/worker/<task id>`

Every line has `level`, `time` and `msg`. The API logs every request once it has finished (`msg: "request"`), with the method, the path, the status, the time taken in ms, the organisation, the API key's prefix, the user agent and the client's address.

```
aws logs tail /ecs/tidewell-api --since 30m
aws logs tail /ecs/tidewell-worker --since 30m --follow
```

`LOG_LEVEL` is `info` in production. At `debug`, every flag lookup is logged too.

## Settings

| variable | what |
|---|---|
| `DATABASE_URL` | Postgres; `connection_limit` is set in the URL |
| `PORT` | the API's port, 8080 |
| `LOG_LEVEL` | `info` or `debug` |
| `UNLEASH_URL`, `UNLEASH_API_TOKEN` | the flag server for the environment |
| `ADMIN_TOKEN_HASHES` | SHA-256 hashes of the staff tokens the support console uses, comma-separated |
| `MAIL_FROM` | the sender of invite emails |
| `INVITE_BASE_URL` | where an invite link points |
| `AWS_REGION` | `eu-west-1` |

## Health

`GET /health` answers 200 without touching the database. The load balancer checks it every 15 seconds.
