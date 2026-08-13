# Database initialization

Create the schema, then import public seed data:

```bash
npm run db:migrate
mysql -u talkscape -p talkscape < database/init-data.sql
```

Regenerate the seed file after changing scenarios or built-in prompts:

```bash
npm run db:init-data
```

The generated SQL intentionally contains no users, administrators, passwords,
conversations, bookmarks, cached model output, or generated audio.
