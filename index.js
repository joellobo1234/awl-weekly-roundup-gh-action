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
    // Logic: Runs on Wednesday 5PM. Report covers last 7 days.
    const now = process.env.DATE_OVERRIDE ? new Date(process.env.DATE_OVERRIDE) : new Date();

    const endDate = now;
    const startDate = subDays(now, 7);

    // Use full ISO strings for precise filtering
    const formattedStart = startDate.toISOString();
    const formattedEnd = endDate.toISOString();

    // Title format: "Week in AWL | start date - end date"
    const titleDateRange = `${format(startDate, "d MMMM yyyy")} - ${format(endDate, "d MMMM yyyy")}`;
    const reportTitle = `Week in AWL | ${titleDateRange}`;

    console.log(`Generating roundup for ${reportTitle}...`);

    // Prioritize SOURCE_REPO (env), then GITHUB_REPOSITORY (current action repo), then fallback.
    const targetRepoName = process.env.SOURCE_REPO || process.env.GITHUB_REPOSITORY || "amedina/agentic-web-learning-tool";
    console.log(`Targeting Repository: ${targetRepoName}`);
    const [sourceOwner, sourceRepo] = targetRepoName.split("/");

    const repoQuery = `repo:${targetRepoName}`;

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
                body
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

    // Sort by Title Prefix Priority: Feature > Feat > Fix > Chore > Others
    const getPrefixPriority = (title) => {
        const t = title.toLowerCase();
        if (t.startsWith("feature")) return 1;
        if (t.startsWith("feat")) return 2;
        if (t.startsWith("fix")) return 3;
        if (t.startsWith("chore")) return 4;
        return 5;
    };

    const sortItems = (a, b) => {
        // First sort by Title Prefix
        const pPA = getPrefixPriority(a.title);
        const pPB = getPrefixPriority(b.title);
        if (pPA !== pPB) return pPA - pPB;

        // Then by Status Priority (Merged > Created > etc)
        const pSA = getPriority(a);
        const pSB = getPriority(b);
        if (pSA !== pSB) return pSA - pSB;

        // Finally by number
        return a.number - b.number;
    };

    prs.sort(sortItems);
    issues.sort(sortItems);

    console.log(`Found ${prs.length} Unique PRs and ${issues.length} Unique Issues.`);

    if (prs.length === 0 && issues.length === 0) {
        console.log("No activity found.");
        // We still want to post if it's a dry run? Or just return? 
        // Previously we returned. Let's keep it consistent.
        // But if user expects a "Nothing happened" report? 
        // The original requirement was "post a discussion...".
        // Let's return, but log it.
        // return; 
        // Actually, let's allow it to proceed so we can see the "No activity" message if desired.
        // But to stay safe with previous behavior:
        // return;
    }

    // Formatting Helpers
    const formatDate = (d) => format(new Date(d), "MMM d");

    const renderAccordion = (item, type = 'pr') => {
        const mergedInWeek = item.mergedAt && item.mergedAt >= formattedStart && item.mergedAt <= formattedEnd;
        const closedInWeek = item.closedAt && item.closedAt >= formattedStart && item.closedAt <= formattedEnd;
        const createdInWeek = item.createdAt >= formattedStart && item.createdAt <= formattedEnd;

        let icon = "⚪";
        let statusText = "Active";
        let date = "";

        if (type === 'pr') {
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
                statusText = "Updated on";
                date = item.updatedAt;
            }
        } else {
            // Issue Logic
            if (closedInWeek) {
                icon = "✅";
                statusText = "Closed on";
                date = item.closedAt;
            } else if (createdInWeek) {
                icon = "✨";
                statusText = "Opened on";
                date = item.createdAt;
            } else {
                icon = "⚡";
                statusText = "Updated on";
                date = item.updatedAt;
            }
        }

        const formattedDateStr = formatDate(date);
        const authorLink = item.author ? `<a href="${item.author.url}">@${item.author.login}</a>` : "unknown";
        const summary = item.aiSummary || (item.body ? item.body.replace(/\n/g, ' ').substring(0, 150) + "..." : "No description provided.");

        const linkText = type === 'pr' ? "📥 View Pull Request" : "🐛 View Issue";

        return `<details>
<summary>${icon} <strong>${item.title}</strong> (${statusText} ${formattedDateStr} by ${authorLink})</summary>
<br>
${summary}
<br><br>
<a href="${item.url}">${linkText}</a>
</details>`;
    };

    // Conversational Summary using Gemini (Global) - Now uses Enriched Data
    const generateGlobalSummary = async (enrichedPRs) => {
        const geminiApiKey = process.env.GEMINI_API_KEY;

        const mergedPRs = enrichedPRs.filter(pr => pr.mergedAt && pr.mergedAt >= formattedStart && pr.mergedAt <= formattedEnd);

        if (mergedPRs.length === 0) {
            return "This week saw steady progress with various improvements.";
        }

        if (!geminiApiKey) {
            console.warn("GEMINI_API_KEY not found, falling back to heuristic summary.");
            const significantPRs = mergedPRs.filter(pr => {
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

            // Use the AI Summaries if available, otherwise fallback to title/body
            const prSummaries = mergedPRs
                .map(pr => `- ${pr.title}: ${pr.aiSummary || pr.body}`)
                .join("\n");

            const prompt = `
            You are writing a weekly newsletter for the "Agentic Web Learning Tool" project.
            Here is the summary of the work completed (Merged PRs) this week:
            ${prSummaries}

            Please write a short, engaging conversational summary (1-2 sentences) highlighting the key progress.
            Focus on the actual value delivered based on the summaries provided.
            Start with "Highlights include..." or similar. Do not use markdown links.
            `;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error("Error generating global summary with Gemini:", error);
            return "This week saw steady progress with various improvements.";
        }
    };

    // Build Body
    let body = `Here is the **${reportTitle}**! 🚀\n\n`;

    // Always generate summary
    // Wait to generate global summary until AFTER enrichment
    // body += `${await generateSummary(prs)}\n\n`; // MOVED DOWN

    body += `### PR Status\n`;

    // Filter relevant PRs for the week for AI Summaries
    const relevantPRs = prs.filter(pr => {
        const mergedInWeek = pr.mergedAt && pr.mergedAt >= formattedStart && pr.mergedAt <= formattedEnd;
        const closedInWeek = pr.closedAt && pr.closedAt >= formattedStart && pr.closedAt <= formattedEnd;
        const createdInWeek = pr.createdAt >= formattedStart && pr.createdAt <= formattedEnd;
        return mergedInWeek || closedInWeek || createdInWeek;
    });

    if (relevantPRs.length > 0 && process.env.GEMINI_API_KEY) {
        try {
            const { GoogleGenerativeAI } = require("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            // Helper to fetch diffs using REST API (More reliable for patches)
            const getPRDiffs = async (prNumber) => {
                try {
                    // Use standard fetch for REST API to get patches reliably
                    const response = await fetch(`https://api.github.com/repos/${sourceOwner}/${sourceRepo}/pulls/${prNumber}/files?per_page=10`, {
                        headers: {
                            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    });

                    if (!response.ok) {
                        console.warn(`Failed to fetch diffs for PR #${prNumber}: ${response.status} ${response.statusText}`);
                        return [];
                    }

                    const files = await response.json();
                    return files.map(f => ({
                        path: f.filename,
                        patch: f.patch
                    }));
                } catch (e) {
                    console.warn(`Failed to fetch diffs for PR #${prNumber}`, e.message);
                    return [];
                }
            };

            const IGNORED_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'dist/', '.min.js', '.map', 'npm-debug.log'];

            // Enrich PRs with Diffs
            console.log("Fetching code diffs (via REST) for improved AI summaries...");
            await Promise.all(relevantPRs.map(async (pr) => {
                const files = await getPRDiffs(pr.number);
                const usefulFiles = files.filter(f => !IGNORED_FILES.some(ignored => f.path.includes(ignored)));

                // create a concise diff string
                pr.diffContext = usefulFiles.map(f => {
                    // heavily caption the patch to avoid token limits, just getting the gist
                    const snippet = (f.patch || '').split('\n').slice(0, 30).join('\n');
                    return `File: ${f.path}\nDiff Preview:\n${snippet}...`;
                }).join('\n\n');
            }));

            // Batch process matched PRs
            const prData = relevantPRs.map((pr, index) => {
                return `
PR #${index}
Title: "${pr.title}"
State: ${pr.state}
Developer Description: "${(pr.body || '').replace(/\n/g, ' ').substring(0, 300)}..."
Code Context (Diffs):
${pr.diffContext || "No diff available."}
--------------------------------------------------
`;
            }).join('\n');

            const prompt = `
            You are a Senior Technical Editor writing a weekly engineering newsletter.
            I will provide a list of Pull Requests. For each PR, I have included the "Developer Description" AND the "Code Context" (files changed).

            YOUR GOAL: Write a "Blended Summary" (2-3 sentences) for each PR.
            1. **Truth Seeking**: If the Developer Description is vague (e.g., "fixed bug"), look at the Code Context to describe *what* actually changed (e.g., "Fixed null pointer in auth logic").
            2. **Synthesis**: Combine the intent (Description) with the reality (Code).
            3. **Format**: Return valid JSON: { "summaries": [ { "index": 0, "summary": "..." }, ... ] }
            
            Input PRs:
            ${prData}
            `;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            // Clean/Parse JSON
            const jsonStart = responseText.indexOf('{');
            const jsonEnd = responseText.lastIndexOf('}');
            const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
            const summaries = JSON.parse(jsonString).summaries;

            // Map summaries back to PRs
            relevantPRs.forEach((pr, i) => {
                const summaryObj = summaries.find(s => s.index === i);
                pr.aiSummary = summaryObj ? summaryObj.summary : "No summary available.";
            });

        } catch (error) {
            console.error("Error generating PR summaries:", error);
        }
    }

    if (relevantPRs.length > 0) {
        body += relevantPRs.map(pr => renderAccordion(pr, 'pr')).join('\n\n');
    } else {
        body += `*No new activity this week*`;
    }
    body += `\n\n`;

    body += `### Issues Status\n`;
    if (issues.length > 0) {
        body += issues.map(issue => renderAccordion(issue, 'issue')).join('\n\n');
    } else {
        body += `*No new issues in this week*`;
    }
    body += `\n\n`;

    // Contributors
    const coreTeam = [
        "amedina", "gagan0123", "amovar18", "mayan-000", "mohdsayed", "maitreyie-chavan", "joellobo1234"
    ];

    // 1. Core Team (Always included)
    const finalContribOrder = [];
    coreTeam.forEach(login => {
        finalContribOrder.push(login);
    });

    // 2. Others (Active but not in core team, sorted alphabetically)
    const others = Array.from(contributors.keys())
        .filter(c => !coreTeam.includes(c))
        .sort();

    finalContribOrder.push(...others);

    const finalContribLinks = finalContribOrder.map(login => {
        const url = contributors.get(login) || `https://github.com/${login}`;
        return `[${login}](${url})`;
    });

    if (finalContribLinks.length > 0) {
        body += `### 🌟 Contributors\nThanks to everyone who engaged this week: ${finalContribLinks.join(', ')}\n\n`;
    }

    body += `\n---\n*Auto-generated by Week in AWL GitHub Action, summarised using Gemini 2.0 Flash. The summaries in this post are generated by AI and may contain inaccuracies. Please verify important details by reviewing the source Pull Requests/Issues directly.*`;

    const globalSummary = await generateGlobalSummary(relevantPRs);

    // Inject summary at the top
    body = `Here is the **${reportTitle}**! 🚀\n\n${globalSummary}\n\n` + body.substring(body.indexOf("### PR Status"));

    if (process.env.DRY_RUN === 'true') {
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
