# AI Todo Backend

Backend-only todo list and task tracker implemented from `specs/001-2026_06_03-19_46-ai-integrated-todo-backend.md`.

## Setup

```sh
npm install
```

Environment variables:

- `HOST`, default `127.0.0.1`
- `PORT`, default `3000`
- `DATA_DIR`, default `./data`
- `DATABASE_FILENAME`, default `ai-todo.sqlite`

## Run

```sh
npm run dev
```

Production-style:

```sh
npm run build
npm start
```

## Test

```sh
npm test
```

The service exposes `GET /health`, `GET /openapi.json`, and JSON APIs under `/api/v1`.
