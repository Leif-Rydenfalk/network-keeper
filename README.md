# Network Keeper

Keep the people you meet, their contact details and your next follow-up in one place. Search public profiles and jobs, or browse attributed links to posts on X, Reddit and LinkedIn.

[Use the free app](https://ce-net.com/share/network/) · [Community](https://www.reddit.com/r/cenet/)

The app has no paid feature tier. Its source is licensed under [AGPL-3.0-only](LICENSE), so you can keep a copy, run it yourself and modify it under that license. The hosted service runs on CE infrastructure. This repository contains the application and its backend; CE infrastructure is maintained separately.

## Run the personal app

Install Python 3 and Node.js 22.13 or later, then:

```sh
git clone https://github.com/Leif-Rydenfalk/network-keeper.git
cd network-keeper
npm test
npm start
```

Open http://127.0.0.1:8949. Contacts, notes and follow-ups stay in that browser's local storage. Use Settings to export a backup before clearing browser data or moving to another device. Camera and NFC support depend on the browser and device.

This static preview includes the discovery feed. Shared profiles, jobs and messages need the backend described below. Requests use `/api/people` on your own host; your copy does not send those requests to the hosted CE service.

## Run the complete app locally

Install the Cloudflare Wrangler CLI. The checked configuration uses Wrangler 4.129.0. From the repository root:

```sh
cp edge/wrangler.example.jsonc edge/wrangler.jsonc
wrangler d1 execute network-keeper --local --config edge/wrangler.jsonc --file edge/schema.sql
wrangler dev --local --config edge/wrangler.jsonc --port 8950
```

Open http://127.0.0.1:8950. The same server serves the app, API and local database. Local test profiles and jobs remain in `.wrangler` storage. They are separate from the public service.

The configuration serves `app/` as static assets and sends `/api/people/*` to the Worker. See Cloudflare's [static asset routing documentation](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).

## Deploy your own service

Use your own Cloudflare account. Hosting is subject to that provider's limits and charges; the application has no license fee.

```sh
wrangler login
wrangler d1 create network-keeper
```

Put the returned database ID in your local `edge/wrangler.jsonc`, replacing `REPLACE_WITH_YOUR_DATABASE_ID`. Choose your own Worker name in that file. Then:

```sh
wrangler d1 execute network-keeper --remote --config edge/wrangler.jsonc --file edge/schema.sql
wrangler deploy --config edge/wrangler.jsonc
```

Open the URL returned by Wrangler. Your instance has its own profiles, jobs and messages. Keep the configuration out of source control; `.gitignore` excludes it.

Profiles require explicit listing consent. Profile and job edit keys are stored in the owner's browser and exported backup. Public search hides reply email addresses. Keep backups of your database and browser data; losing an edit key can prevent you from managing the corresponding entry.

## Refresh discovery links

Discovery is a bounded collection of public links, not a complete copy of any platform. Cards retain original author names where available, source URLs and observation dates. The person sharing the link is anonymous. Third-party post text remains its author's work and is not relicensed by this repository.

Collect the latest public r/forhire RSS titles and merge them into the feed:

```sh
python3 tools/collect_reddit.py --output /tmp/reddit-posts.json --merge-feed app/discovery.json
```

The collector copies title metadata only. A failed fetch leaves the existing feed in place. Review the resulting changes and redeploy to publish them. No background collector is installed by these commands.

For other reviewed public sources, pass a JSON array to `node tools/import_discovery.cjs INPUT.json`. Each row needs `url`, `title`, `author`, `visibility: "public"`, an ISO `observed_at` timestamp, optional `published_at`, and `evidence` set to `page_read` or `search_result`. Only supported public X, Reddit and LinkedIn post URLs are accepted. Private messages and contact exports do not belong in this feed.

## Contribute

Use the repository's issues for bugs and feature requests. Include the browser, what you expected and the steps that reproduce the problem. Remove personal contact details, exports and edit keys from screenshots and attachments.

Run `npm test` before submitting a change. Third-party OCR components retain their license notices in `app/vendor/ocr/`.

Maintained by Foreman (`foreman/win-8321`).
