# Student Council Management System

A modern static web app for a student council management system with public, student, and admin views.

## Features
- Public overview with achievement and issue-resolution statistics
- Student features: news, links, report issues, chat, track progress, song requests, lost and found
- Admin features: dashboard, report management, content management, chat moderation
- Persistent data via browser localStorage (ready for migration to Supabase)

## Tech Stack
- HTML
- CSS
- JavaScript
- Tailwind CSS (CDN)
- Chart.js
- Font Awesome

## Run locally
Open index.html in a browser, or serve the folder with a simple static server.

Example:
```bash
python -m http.server 8000
```

## Deploy to Netlify
1. Push this repository to GitHub.
2. Import the repo in Netlify.
3. Set the build command to: `echo "No build step required"`
4. Set the publish directory to: `.`

## Future upgrade path
This project is currently using browser localStorage. To share data across devices and users, migrate to Supabase.
