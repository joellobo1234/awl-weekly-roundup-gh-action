# Weekly Agentic Web Learning Roundup Action

A professional GitHub Action that generates insightful, AI-powered weekly summaries of project activity. This tool automates the creation of "Week in AWL" status updates by scraping Pull Requests, Issues, and Contributor data from a target repository and posting a structured announcement to GitHub Discussions.

## 🚀 Features

*   **Automated Weekly Reporting**: scheduled to run every Saturday to capture the previous week's progress.
*   **AI-Powered Summaries**: Utilizes **Google Gemini 2.0 Flash** to generate engaging, human-readable summaries for merged Pull Requests.
*   **Smart Categorization**: Sorts updates by type (Features > Fixes > Chores) and status (Merged, Closed, WIP).
*   **Accordion-Style UI**: Presents data in clean, collapsible sections for better readability.
*   **Contributor Recognition**: Automatically highlights active contributors, prioritizing core team members.
*   **Flexible Configuration**: Supports manual triggers, date overrides for backfilling, and dry-run modes.

## 🛠 Tech Stack

*   **Runtime**: Node.js
*   **API Interactions**: `@octokit/graphql` (GitHub API)
*   **AI Integration**: `@google/generative-ai` (Google Gemini)
*   **Date Handling**: `date-fns`
*   **CI/CD**: GitHub Actions

## 📋 usage

### Standard Setup

This action is pre-configured to run automatically on the `amedina/agentic-web-learning-tool` repository logic but acts as a reusable template.

To use this in your own project:

1.  **Clone/Fork** this repository.
2.  **Configure Secrets**:
    *   `GEMINI_API_KEY`: Required for AI summaries. Get one from [Google AI Studio](https://aistudio.google.com/).
    *   `GITHUB_TOKEN`: Automatically provided by Actions, but ensure permissions are set (see below).
3.  **Workflow File**: Ensure `.github/workflows/weekly-awl-roundup.yml` exists.

### Permissions

The workflow requires the following permissions to query data and create discussions:

```yaml
permissions:
  discussions: write
  contents: read
```

### Manual Trigger

You can manually trigger the report generation for any past or specific date range via the "Actions" tab in GitHub.

1.  Go to the **Actions** tab in your repository.
2.  Select **"Weekly AWL Roundup"** from the sidebar.
3.  Click **"Run workflow"**.
4.  **Inputs**:
    *   `date_override`: (Optional) Enter a date (YYYY-MM-DD) to simulate the run happening on that day. The report will cover the 7 days prior.
    *   `dry_run`: (Optional) Set to `true` to generate the report in the build logs *without* posting a public discussion.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

*This tool is maintained by the AWL Team.*
