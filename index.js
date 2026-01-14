const { graphql } = require("@octokit/graphql");
const { subDays, startOfDay, endOfDay, format } = require("date-fns");

async function main() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error("GITHUB_TOKEN is required");
    }

    const graphqlWithAuth = graphql.defaults({
        headers: {
            authorization: `token ${token}`,
        },
    });

    // Calculate dates
    // Logic: Run on Saturday, Report covers [Previous Saturday] to [Yesterday Friday]
    const now = process.env.DATE_OVERRIDE ? new Date(process.env.DATE_OVERRIDE) : new Date();

    const endDate = endOfDay(subDays(now, 1));    // Yesterday (Friday)
    const startDate = startOfDay(subDays(now, 7)); // 7 Days ago (Last Saturday)

    const formattedStart = format(startDate, "yyyy-MM-dd");
    const formattedEnd = format(endDate, "yyyy-MM-dd");

    // Title format: "Week in AWL | start date - end date"
    const titleDateRange = `${format(startDate, "d MMMM yyyy")} - ${format(endDate, "d MMMM yyyy")}`;
    const reportTitle = `Week in AWL | ${titleDateRange}`;

    console.log(`Generating roundup for ${reportTitle}...`);

    const repoQuery = "repo:amedina/agentic-web-learning-tool";

    // We want to capture ALL activity
    const prsBodyQuery = `${repoQuery} is:pr updated:${formattedStart}..${formattedEnd}`;
    const issuesBodyQuery = `${repoQuery} is:issue updated:${formattedStart}..${formattedEnd}`;

    const fetchItems = async (q) => {
        try {
            const { search } = await graphqlWithAuth(`
        query($q: String!) {
          search(query: $q, type: ISSUE, first: 100) {
            nodes {
              ... on PullRequest {
                __typename
                number
                title
                body
                url
                state
                createdAt
                updatedAt
                closedAt
                mergedAt
                author { login url }
                comments(first: 20) { nodes { author { login url } } }
                reviews(first: 20) { nodes { author { login url } } }
              }
              ... on Issue {
                __typename
                number
                title
                url
                state
                createdAt
                updatedAt
                closedAt
                author { login url }
                comments(first: 20) { nodes { author { login url } } }
              }
            }
          }
        }
      `, { q });
            return search.nodes;
        } catch (e) {
            console.warn("Error fetching items, returning empty", e.message);
            return [];
        }
    };

    const [prItems, issueItems] = await Promise.all([
        fetchItems(prsBodyQuery),
        fetchItems(issuesBodyQuery)
    ]);

    const allItems = new Map();
    const contributors = new Map();

    const addContributor = (author) => {
        if (author && author.login) {
            contributors.set(author.login, author.url);
        }
    };

    [...prItems, ...issueItems].forEach(item => {
        allItems.set(item.url, item);
        addContributor(item.author);

        if (item.comments && item.comments.nodes) {
            item.comments.nodes.forEach(c => addContributor(c.author));
        }
        if (item.reviews && item.reviews.nodes) {
            item.reviews.nodes.forEach(r => addContributor(r.author));
        }
    });

    const prs = [];
    const issues = [];

    for (const item of allItems.values()) {
        if (item.__typename === 'PullRequest') prs.push(item);
        else issues.push(item);
    }

    // Sort by Priority
    const getPriority = (item) => {
        const createdInWeek = item.createdAt >= formattedStart && item.createdAt <= formattedEnd;

        if (item.__typename === 'PullRequest') {
            const mergedInWeek = item.mergedAt && item.mergedAt >= formattedStart && item.mergedAt <= formattedEnd;
            const closedInWeek = item.closedAt && item.closedAt >= formattedStart && item.closedAt <= formattedEnd;

            if (mergedInWeek) return 1;
            if (closedInWeek) return 4;
            if (createdInWeek) return 2;
            return 3;
        } else {
            const closedInWeek = item.closedAt && item.closedAt >= formattedStart && item.closedAt <= formattedEnd;
            if (closedInWeek) return 4;
            if (createdInWeek) return 2;
            return 3;
        }
    };

    const sortItems = (a, b) => {
        const pA = getPriority(a);
        const pB = getPriority(b);
        if (pA !== pB) return pA - pB;
        return a.number - b.number;
    };

    prs.sort(sortItems);
    issues.sort(sortItems);

    console.log(`Found ${prs.length} Unique PRs and ${issues.length} Unique Issues.`);

    if (prs.length === 0 && issues.length === 0) {
        console.log("No activity found.");
        return;
    }

    // Formatting Helpers
    const formatDate = (d) => format(new Date(d), "MMM d");

    const formatBullet = (item) => {
        const createdInWeek = item.createdAt >= formattedStart && item.createdAt <= formattedEnd;

        let icon = "⚪";
        let statusText = "Active";
        let date = "";

        if (item.__typename === 'PullRequest') {
            const mergedInWeek = item.mergedAt && item.mergedAt >= formattedStart && item.mergedAt <= formattedEnd;
            const closedInWeek = item.closedAt && item.closedAt >= formattedStart && item.closedAt <= formattedEnd;

            if (mergedInWeek) {
                icon = "✅";
                statusText = "Merged on";
                date = item.mergedAt;
            } else if (closedInWeek) {
                icon = "🔴";
                statusText = "Closed on";
                date = item.closedAt;
            } else if (createdInWeek) {
                icon = "🚧";
                statusText = "Opened on";
                date = item.createdAt;
            } else {
                icon = "⚡";
                statusText = "Active";
                date = item.updatedAt;
            }
        } else {
            const closedInWeek = item.closedAt && item.closedAt >= formattedStart && item.closedAt <= formattedEnd;

            if (closedInWeek) {
                icon = "✅";
                statusText = "Closed on";
                date = item.closedAt;
            } else if (createdInWeek) {
                icon = "🚧";
                statusText = "Opened on";
                date = item.createdAt;
            } else {
                icon = "⚡";
                statusText = "Active";
                date = item.updatedAt;
            }
        }

        const linkedStatus = date ? `[${statusText} ${formatDate(date)}](${item.url})` : `[${statusText}](${item.url})`;
        const authorLink = item.author ? `[@${item.author.login}](${item.author.url})` : "unknown";

        return `- ${icon} [${item.title}](${item.url}) (${linkedStatus} by ${authorLink})`;
    };

    // Conversational Summary using Gemini
    const generateSummary = async (prsNodes) => {
        if (prsNodes.length === 0) return "This week saw steady progress with various improvements.";

        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            console.warn("GEMINI_API_KEY not found, falling back to heuristic summary.");
            const significantPRs = prsNodes.filter(pr => {
                const mergedInWeek = pr.mergedAt && pr.mergedAt >= formattedStart && pr.mergedAt <= formattedEnd;
                if (!mergedInWeek) return false;
                const t = pr.title.toLowerCase();
                return t.includes("feat") || t.includes("add") || t.includes("support") || t.includes("stable") || t.includes("release") || t.includes("update") || t.includes("fix");
            });
            if (significantPRs.length === 0) return "This week saw steady progress with various improvements.";
            const updates = significantPRs.map(pr => `[${pr.title.replace(/^(feat|fix|chore|docs)(\(.*\))?:/i, '').trim()}](${pr.url})`).slice(0, 3);
            if (updates.length === 1) return `We are excited to highlight the completion of ${updates[0]}.`;
            return `Highlights include ${updates.slice(0, -1).join(', ')} and ${updates.slice(-1)}.`;
        }

        try {
            const { GoogleGenerativeAI } = require("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(geminiApiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            const prSummaries = prsNodes
                .filter(pr => pr.mergedAt && pr.mergedAt >= formattedStart && pr.mergedAt <= formattedEnd)
                .map(pr => `- ${pr.title} (Author: ${pr.author ? pr.author.login : 'unknown'})`)
                .join("\n");

            if (!prSummaries) return "This week saw steady progress with various improvements.";

            const prompt = `
            You are writing a weekly newsletter for the "Agentic Web Learning Tool" project.
            Here is the list of Pull Requests merged this week:
            ${prSummaries}

            Please write a short, engaging conversational summary (1-2 sentences) highlighting the key progress.
            Focus on the value delivered. Do not list every PR. Do not use markdown links in your response, just text.
            Start with "Highlights include..." or similar.
            `;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error("Error generating summary with Gemini:", error);
            return "This week saw steady progress with various improvements.";
        }
    };

    // Build Body
    let body = `Here is the **${reportTitle}**! 🚀\n\n`;

    // Generate Global Summary (using existing function, but modified to just return the text if we want, or keep as is)
    // Actually, let's keep the global summary at the top, and THEN do the per-PR summaries.
    if (prs.length > 0) {
        body += `${await generateSummary(prs)}\n\n`;
    }

    body += `### PR Status\n`;

    // Separate Merged PRs for detailed summarization
    const mergedPRs = prs.filter(pr => pr.mergedAt && pr.mergedAt >= formattedStart && pr.mergedAt <= formattedEnd);
    const otherPRs = prs.filter(pr => !(pr.mergedAt && pr.mergedAt >= formattedStart && pr.mergedAt <= formattedEnd));

    if (mergedPRs.length > 0 && process.env.GEMINI_API_KEY) {
        try {
            const { GoogleGenerativeAI } = require("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            const prData = mergedPRs.map((pr, index) => `PR #${index}: Title: "${pr.title}", Body: "${(pr.body || '').replace(/\n/g, ' ').substring(0, 200)}..."`).join('\n');

            const prompt = `
            You are analyzing Pull Requests for a changelog.
            Here are the merged PRs:
            ${prData}

            For each PR, write a 1-sentence summary of the functionality merged.
            Return valid JSON format: { "summaries": [ { "index": 0, "summary": "..." }, ... ] }
            Do not include markdown formatting in the JSON.
            `;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            // Clean/Parse JSON
            const jsonStart = responseText.indexOf('{');
            const jsonEnd = responseText.lastIndexOf('}');
            const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
            const summaries = JSON.parse(jsonString).summaries;

            // Map summaries back to PRs
            mergedPRs.forEach((pr, i) => {
                const summaryObj = summaries.find(s => s.index === i);
                pr.aiSummary = summaryObj ? summaryObj.summary : "No summary available.";
            });

        } catch (error) {
            console.error("Error generating PR summaries:", error);
        }
    }

    // Render Merged PRs with Collapsible Sections
    if (mergedPRs.length > 0) {
        body += mergedPRs.map(pr => {
            const statusText = `Merged on ${formatDate(pr.mergedAt)}`;
            const authorLink = pr.author ? `[@${pr.author.login}](${pr.author.url})` : "unknown";
            const summary = pr.aiSummary || (pr.body ? pr.body.substring(0, 100) + "..." : "No description provided.");

            return `<details>
<summary>✅ <strong>${pr.title}</strong> (${statusText} by ${authorLink})</summary>
<br>
${summary}
<br><br>
<a href="${pr.url}">View Pull Request</a>
</details>`;
        }).join('\n\n');
        body += '\n\n';
    }

    // Render Other PRs (Open/Closed but not merged) normally
    if (otherPRs.length > 0) {
        body += otherPRs.map(formatBullet).join('\n');
    } else if (mergedPRs.length === 0) {
        body += `*No new activity this week*`;
    }
    body += `\n\n`;

    body += `### Issues Status\n`;
    if (issues.length > 0) {
        body += issues.map(formatBullet).join('\n');
    } else {
        body += `*No new activity this week*`;
    }
    body += `\n\n`;

    if (contributors.size > 0) {
        const sortedContributors = Array.from(contributors.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const links = sortedContributors.map(([name, url]) => `[${name}](${url})`);
        body += `### 🌟 Contributors\nThanks to everyone who engaged this week: ${links.join(', ')}\n\n`;
    }

    body += `\n---\n*Auto-generated by Week in AWL Action*`;

    if (process.env.DRY_RUN) {
        console.log("---------------------------------------------------");
        console.log("DRY RUN MODE ENABLED. Generated Body:");
        console.log("---------------------------------------------------");
        console.log(body);
        console.log("---------------------------------------------------");
        return;
    }

    const targetRepo = process.env.GITHUB_REPOSITORY;
    if (!targetRepo) throw new Error("GITHUB_REPOSITORY env var not set");

    const [currentOwner, currentRepo] = targetRepo.split("/");

    const { repository } = await graphqlWithAuth(`
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        id
        discussionCategories(first: 10) { nodes { id name } }
      }
    }
  `, { owner: currentOwner, repo: currentRepo });

    const repoId = repository.id;
    const categories = repository.discussionCategories.nodes;
    let category = categories.find(c => c.name.toLowerCase() === "announcements") || categories[0];

    if (!category) throw new Error("No discussion categories found.");

    console.log(`Posting to Category: ${category.name}`);

    const { createDiscussion } = await graphqlWithAuth(`
    mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
      createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body}) {
        discussion { url }
      }
    }
  `, {
        repositoryId: repoId,
        categoryId: category.id,
        title: reportTitle,
        body: body
    });

    console.log(`Discussion created: ${createDiscussion.discussion.url}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
