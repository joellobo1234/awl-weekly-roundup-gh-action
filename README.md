# Weekly Agentic Web Learning Roundup Action

> ⚠️ **AI Generated Content Warning**
>
> This tool utilizes **Google Gemini 2.0 Flash** artificial intelligence to summarize technical Pull Requests and Issues. While we strive for accuracy, AI summaries may occasionally omit details or contain inaccuracies. **Always verify critical information by reviewing the source Pull Requests and Issues directly.**

A professional GitHub Action that automates the creation of "Week in AWL" status updates. It scrapes activity from a target repository (Pull Requests, Issues, Contributors) and posts a structured, AI-enhanced announcement to GitHub Discussions every week.

## 🚀 Features

*   **Automated Weekly Reporting**: Scheduled to run every **Saturday at 00:00 UTC** to capture the previous week's progress.
*   **AI-Powered Summaries**: Uses **Google Gemini 2.0 Flash** to write:
    *   A high-level conversational overview of the week's achievements.
    *   Detailed, context-aware summaries for each merged Pull Request.
*   **Smart Categorization**: Sorts updates by type (`Feature` > `Feat` > `Fix` > `Chore`) and status (`Merged` > `Created` > `Closed`).
*   **Accordion-Style UI**: Presents data in clean, collapsible sections for better readability.
*   **Contributor Recognition**: Automatically highlights active contributors from the community.
*   **Flexible Configuration**: Supports manual triggers, date overrides for backfilling, and customizable source repositories.

## 🛠 Tech Stack

*   **Runtime**: Node.js 20
*   **API Interactions**: `@octokit/graphql` (GitHub API)
*   **AI Integration**: `@google/generative-ai` (Google Gemini)
*   **Date Handling**: `date-fns`
*   **CI/CD**: GitHub Actions

## 📋 Usage

### standard Setup (Default)

This action is currently configured to scrape **`amedina/agentic-web-learning-tool`** and post announcements to the repository where it runs.

### Using in Your Own Repository

To adapt this action for your own project:

1.  **Clone/Fork** this repository.
2.  **Configure Environment**:
    *   Navigate to **Settings > Secrets and variables > Actions**.
    *   Add `GEMINI_API_KEY`: Required for AI summaries. Get one from [Google AI Studio](https://aistudio.google.com/).
    *   `GITHUB_TOKEN`: This is automatically provided by GitHub Actions, but ensure the workflow has write permissions (see below).
3.  **Workflow File**: Check `.github/workflows/weekly-awl-roundup.yml`.

### Permissions

The workflow requires the following permissions to query data and create discussions:

```yaml
permissions:
  discussions: write
  contents: read
```

### Manual Trigger & Configuration

You can manually trigger the report generation for any past date or different repository via the "Actions" tab.

1.  Go to the **Actions** tab in your repository.
2.  Select **"Weekly AWL Roundup"** from the sidebar.
3.  Click **"Run workflow"**.
4.  **Inputs**:
    *   `date_override`: (Optional) Enter a date (YYYY-MM-DD) to simulate the run happening on that day. The report will cover the 7 days prior.
    *   `dry_run`: (Optional) Set to `true` to generate the report in the build logs *without* posting a public discussion.
    *   `source_repo`: (Optional) The `owner/repo` to scrape data from. Defaults to `amedina/agentic-web-learning-tool` if left blank.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

*This tool is maintained by the AWL Team.*
