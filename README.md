# Weekly AWL Roundup Action

This GitHub Action generates a weekly summary of activity (PRs, Issues, and Contributors) from the [amedina/agentic-web-learning-tool](https://github.com/amedina/agentic-web-learning-tool) repository.

It runs every Saturday and posts a "Week in AWL" announcement to the Discussions tab of the repository where this action is installed.

## How it works

- **Schedule**: Runs every Saturday at 00:00 UTC.
- **Scope**: Covers the previous week (Saturday to Friday).
- **Output**: Creates a new Discussion in the "Announcements" category.

## Usage

This action is designed to run automatically. You can also trigger it manually via the Actions tab.

### Inputs (Workflow Dispatch)

- `date_override`: (Optional) Simulate a run date (YYYY-MM-DD).
- `dry_run`: (Optional) Set to `true` to print the output to logs instead of creating a discussion.
