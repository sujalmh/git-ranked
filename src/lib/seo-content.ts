export type SEOPageData = {
  slug: string;
  title: string;
  metaDescription: string;
  heroTitle: string;
  heroSubtitle: string;
  heroHighlight: string;
  sections: {
    title: string;
    content: string;
  }[];
  faqs: {
    question: string;
    answer: string;
  }[];
};

export const seoPages: Record<string, SEOPageData> = {
  'github-insights': {
    slug: 'github-insights',
    title: 'GitHub Insights & Engineering Analytics Guide | GitRanked',
    metaDescription: 'Comprehensive guide to GitHub insights and analytics for engineering teams. Learn how to track pull request bottlenecks, measure true contributor impact, and optimize delivery speed.',
    heroTitle: 'DEEP GITHUB',
    heroHighlight: 'INSIGHTS & ANALYTICS',
    heroSubtitle: 'Move far beyond basic commit counts and lines of code. Gain true visibility into software architecture changes, code review bottlenecks, and team collaboration patterns with advanced GitHub analytics.',
    sections: [
      {
        title: 'What are GitHub Insights & Why Do They Matter?',
        content: 'GitHub Insights refer to actionable intelligence derived from analyzing the raw event stream of a software repository—including pull request reviews, commit histories, issue discussions, workflow runs, and code diff churn. While basic activity graphs show when code was pushed, deep GitHub insights answer vital operational questions: How long does code sit waiting for review? Who is burdened with code quality checks? Is technical debt accumulating in critical modules? For engineering managers and VPs of Engineering, these insights provide the empirical foundation required to streamline software delivery without burning out senior developers.'
      },
      {
        title: 'The Danger of Superficial Developer Metrics',
        content: 'Historically, engineering organizations relied on vanity metrics such as total commits, lines of code (LOC) added, or closed ticket counts. Modern engineering research (including DORA and SPACE frameworks) proves that evaluating engineers on raw volume severely distorts team incentives. Tracking LOC rewards copy-pasting verbose code or splitting simple changes across multiple commits, while penalizing developers who spend hours refactoring complex algorithms into concise, maintainable 5-line functions. Furthermore, naive metrics ignore "glue work"—the indispensable work of conducting detailed code reviews, maintaining test suites, and unblocking junior engineers.'
      },
      {
        title: 'Key Operational Metrics Tracked by GitRanked',
        content: 'GitRanked aggregates repository activity to compute balanced operational metrics: (1) PR Cycle Time—measuring the complete duration from draft PR creation to production merge; (2) Time to First Review—tracking how fast pull requests receive human feedback; (3) Review Depth & Thoroughness—analyzing inline comments and architectural feedback rather than simple LGTM approvals; and (4) Contributor Distribution—identifying single points of failure where critical knowledge is trapped with a single maintainer.'
      },
      {
        title: 'How AI Elevates Engineering Analytics',
        content: 'Traditional dashboard tools present raw tables that require manual filtering and complex queries. GitRanked integrates advanced generative AI to summarize complex pull request diffs, highlight breaking API changes, and evaluate code review health automatically. By contextualizing code changes with semantic analysis, GitRanked ensures engineering leaders receive digestible, executive-ready briefings without spending hours digging through GitHub event logs.'
      }
    ],
    faqs: [
      {
        question: 'How does GitRanked connect to my GitHub repositories?',
        answer: 'GitRanked connects securely via official GitHub Apps OAuth. Once granted read-only access to selected public or private repositories, it ingests webhook events in real-time to generate automated dashboards.'
      },
      {
        question: 'Are my private repository code diffs kept secure?',
        answer: 'Yes. GitRanked does not store your raw source code files on disk. We process event metadata and diff summaries strictly to compute analytics, using industry-standard encryption in transit and at rest.'
      },
      {
        question: 'How do GitHub insights help reduce PR cycle times?',
        answer: 'By surfacing bottlenecks—such as PRs waiting more than 24 hours for initial review or PRs with excessive back-and-forth comments—leads can establish SLA alerts, reassign review workloads, and encourage smaller PR sizes.'
      }
    ]
  },
  'pr-review-metrics': {
    slug: 'pr-review-metrics',
    title: 'PR Review Metrics & Velocity Optimization | GitRanked',
    metaDescription: 'Optimize code review velocity and eliminate engineering bottlenecks. Discover how to measure PR cycle times, review turnaround, and developer reviewer load.',
    heroTitle: 'PULL REQUEST',
    heroHighlight: 'REVIEW METRICS',
    heroSubtitle: 'Code reviews are the backbone of software quality, but they can easily become a major pipeline bottleneck. Track review turnaround, reviewer load, and cycle velocity.',
    sections: [
      {
        title: 'Understanding Pull Request Review Metrics',
        content: 'Pull Request (PR) metrics evaluate the effectiveness, speed, and health of code peer reviews within an engineering team. The code review stage is frequently the longest phase in the software delivery pipeline. A pull request that takes 2 hours to write may wait 72 hours for an initial review, context-switching the author and stalling feature deployments. Measuring PR review metrics allows organizations to pinpoint latency sources and establish healthy team norms.'
      },
      {
        title: 'Essential PR Review Metrics to Monitor',
        content: 'To maintain high delivery momentum without sacrificing code quality, teams must track three core dimensions: (1) Pickup Latency—the time elapsed between opening a non-draft PR and a reviewer leaving the first meaningful comment or approval; (2) Review Iteration Count—the number of change request cycles between author and reviewer; and (3) Review Load Balancing—monitoring whether senior engineers are overwhelmed with reviews while mid-level engineers are underutilized.'
      },
      {
        title: 'Strategies for Speeding Up Code Reviews',
        content: 'Accelerating review turnaround requires a combination of automated tooling and process improvements. Best practices include enforcing small PR sizes (under 250 lines of changed code), using automated CI linting and test coverage checks prior to human review, establishing team review SLAs, and utilizing AI-generated PR summaries like those built into GitRanked to help reviewers instantly grasp complex pull request context.'
      },
      {
        title: 'Preventing Reviewer Burnout & Context Switching',
        content: 'Unmanaged review requests lead to constant interruptions and developer burnout. When a lead developer receives dozens of review requests daily, review quality drops to rubber-stamping, and critical bugs escape into production. GitRanked tracks review distribution across your organization, allowing managers to rotate review duties fairly and protect focus time for deep architectural work.'
      }
    ],
    faqs: [
      {
        question: 'What is a healthy PR cycle time benchmark?',
        answer: 'High-performing engineering teams typically achieve a PR cycle time under 24 to 48 hours for standard features, with first review pickup times under 4 hours during working hours.'
      },
      {
        question: 'Does GitRanked penalize teams for thorough code reviews?',
        answer: 'No. GitRanked distinguishes between idle wait time (stalled PRs) and active collaborative review iterations that improve code security and architecture.'
      },
      {
        question: 'Can we integrate PR metrics with Slack or Discord?',
        answer: 'Yes, GitRanked provides configurable notifications to remind assigned reviewers about pending PRs before SLAs are breached.'
      }
    ]
  },
  'repository-health': {
    slug: 'repository-health',
    title: 'GitHub Repository Health Check & Quality Metrics | GitRanked',
    metaDescription: 'Evaluate GitHub repository health, code stability, maintenance risks, and contributor collaboration graphs with AI-assisted repository health audits.',
    heroTitle: 'REPOSITORY',
    heroHighlight: 'HEALTH & AUDITING',
    heroSubtitle: 'Is your codebase thriving or silently accumulating technical debt? Audit repository health, delivery consistency, and knowledge dispersion across your engineering team.',
    sections: [
      {
        title: 'Defining Software Repository Health',
        content: 'Repository health is a holistic assessment of a code project\'s long-term sustainability, release stability, and maintainability. A repository with high commit counts may still be in poor health if it suffers from excessive code churn, unanswered issues, single-developer silos, or long-unmerged pull requests. Measuring repository health helps technology leaders mitigate technical debt and maintain continuous delivery confidence.'
      },
      {
        title: 'The Four Pillars of Repository Health',
        content: 'GitRanked evaluates repository health across four vital pillars: (1) Code Stability & Churn—analyzing how often recently merged code must be rewritten or hotfixed; (2) Collaboration & Knowledge Sharing—ensuring multiple team members understand key codebase modules; (3) Delivery Consistency—monitoring steady PR merge velocity rather than unpredictable release bursts; and (4) Community & Maintenance Response—tracking response times for opened issues and community contributions.'
      },
      {
        title: 'Identifying Bus Factor & Knowledge Silos',
        content: 'The "Bus Factor" represents the minimum number of team members that can be lost before a project stalls due to lack of knowledge. Unhealthy repositories often have a Bus Factor of 1 for core subsystems—meaning only one developer understands how critical databases, microservices, or build pipelines function. GitRanked visualizes file ownership and review patterns to flag dangerous knowledge silos early.'
      },
      {
        title: 'Automating Health Checks with AI',
        content: 'Rather than running periodic manual audits, GitRanked continuously evaluates repository events against trained health algorithms. The system assigns a 0–100 Repository Health Score, highlighting key risk areas and recommending concrete remediation steps for engineering managers and technical leads.'
      }
    ],
    faqs: [
      {
        question: 'How is the GitRanked Repository Health Score calculated?',
        answer: 'GitRanked scores health from the same work-unit model that powers contributor scores: it aggregates the AI-classified value of shipped work (scaled per-contributor so a lone contributor cannot inflate a repo), average code quality from each work unit, review coverage of merged PRs, and knowledge distribution (bus factor). Every metric is an honest 0–100 score with no artificial floors, so an inactive repo reads as inactive.'
      },
      {
        question: 'Can repository health checks be run on open-source projects?',
        answer: 'Yes. Maintainers can use GitRanked public repository analytics to monitor open-source project health and highlight active contributors.'
      },
      {
        question: 'How often are repository health metrics updated?',
        answer: 'Repository health metrics update automatically in real-time as GitHub webhooks deliver new pull request, commit, and review events.'
      }
    ]
  },
  'engineering-metrics': {
    slug: 'engineering-metrics',
    title: 'Engineering Metrics & DORA Analytics Dashboard | GitRanked',
    metaDescription: 'Build a modern engineering metrics dashboard. Track DORA metrics, deployment frequency, lead time for changes, and developer productivity with AI context.',
    heroTitle: 'ENGINEERING',
    heroHighlight: 'METRICS DASHBOARD',
    heroSubtitle: 'Ditch misleading vanity stats. Empower your software organization with objective engineering metrics, DORA delivery speed, and developer impact context.',
    sections: [
      {
        title: 'The Evolution of Software Engineering Metrics',
        content: 'Over the past decade, software engineering measurement has undergone a profound shift. Leading technology organizations have abandoned arbitrary metrics like story point velocity or hourly tracking in favor of empirical frameworks like DORA (DevOps Research and Assessment) and SPACE. Modern engineering metrics focus on measuring systemic flow, deployment frequency, change lead time, and developer satisfaction.'
      },
      {
        title: 'Understanding DORA Core Metrics',
        content: 'The DORA framework identifies four foundational metrics that predict high-performing software teams: (1) Deployment Frequency—how often production releases occur; (2) Lead Time for Changes—the duration from code commit to production deployment; (3) Change Failure Rate—the percentage of deployments causing production outages; and (4) Mean Time to Recovery (MTTR)—how quickly production incidents are resolved. GitRanked correlates PR lifecycle data directly with release tags to compute these metrics automatically.'
      },
      {
        title: 'Why Context Matters in Productivity Metrics',
        content: 'Data without context is dangerous. A team that merges 100 small documentation fixes might appear highly active on raw charts, while a team refactoring a legacy payments module might show fewer merges despite delivering far greater business value. GitRanked uses AI semantic indexing to categorize pull requests by complexity and architectural impact, providing leads with the qualitative story behind the numbers.'
      },
      {
        title: 'Building a Culture of Continuous Improvement',
        content: 'Engineering metrics should never be weaponized for punitive individual comparisons. The most successful organizations use metrics transparently during team retrospectives to uncover broken build pipelines, advocate for technical debt refactoring budgets, and celebrate collaborative engineering achievements.'
      }
    ],
    faqs: [
      {
        question: 'What are the 4 DORA metrics tracked in engineering dashboards?',
        answer: 'Deployment Frequency, Lead Time for Changes, Change Failure Rate, and Mean Time to Recovery (MTTR).'
      },
      {
        question: 'How does GitRanked handle privacy for individual developers?',
        answer: 'GitRanked emphasizes team-level velocity, collaborative review health, and positive contribution recognition rather than micromanagement metrics.'
      },
      {
        question: 'Can I export engineering metrics reports for executive leadership?',
        answer: 'Yes, GitRanked supports generating PDF executive summaries and sharing read-only dashboard links for stakeholders.'
      }
    ]
  },
  'github-contributor-analytics': {
    slug: 'github-contributor-analytics',
    title: 'GitHub Contributor Analytics & Impact Scoring | GitRanked',
    metaDescription: 'Analyze GitHub contributor impact beyond simple commit counts. Discover maintainer personas, code review champion awards, and fair contribution scoring.',
    heroTitle: 'CONTRIBUTOR',
    heroHighlight: 'ANALYTICS & IMPACT',
    heroSubtitle: 'Recognize the true architects, maintainers, and reviewers on your team. Evaluate developer impact, collaboration personas, and code review habits.',
    sections: [
      {
        title: 'Rethinking Contributor Analytics',
        content: 'Measuring developer contribution solely by commit history or lines written ignores the most valuable aspects of software craft. Senior architects, technical leads, and dedicated maintainers often spend their days conducting rigorous code reviews, unblocking teammates, triaging complex security vulnerabilities, and designing API schemas. GitRanked contributor analytics evaluates the full spectrum of developer activity to give proper credit where it is due.'
      },
      {
        title: 'Developer Collaboration Personas',
        content: 'By analyzing interaction graphs across pull requests, inline comments, and commit distributions, GitRanked identifies distinct developer collaboration personas: (1) The Architect—delivering high-complexity core refactors; (2) The Review Champion—ensuring high code quality and fast review turnarounds; (3) The Steady Feature Builder—shipping consistent increments; and (4) The Maintainer—keeping dependencies, tests, and repository health in top shape.'
      },
      {
        title: 'Conducting Fair & Objective Performance Reviews',
        content: 'Subjective performance reviews often suffer from recency bias or favor vocal team members over quiet, highly impactful engineers. Integrating empirical contributor analytics into review conversations ensures that "glue work" and critical support roles are visible and rewarded alongside headline feature launches.'
      },
      {
        title: 'Empowering Open Source Maintainers & Communities',
        content: 'For open-source software projects, recognizing community contributors is essential for maintainer retention. GitRanked contributor leaderboards provide maintainers with public showcases to highlight top external contributors, review leaders, and bug fixers.'
      }
    ],
    faqs: [
      {
        question: 'How does GitRanked score contributor impact?',
        answer: 'Every piece of work is AI-classified into structured facts (scope, user impact, testing, architecture, risk) that derive a value. Contributors are then scored across four dimensions — Impact, Quality, Collaboration, and Consistency — with current and all-time decay profiles, plus a 0–100 percentile showing how they rank against every other contributor in the repo. Co-authored work is credited proportionally and work is never double-counted across a PR and its commits.'
      },
      {
        question: 'Can open-source maintainers showcase contributor analytics publicly?',
        answer: 'Yes! Maintainers can link directly to public GitRanked showcase URLs for their repository.'
      },
      {
        question: 'Is contributor analytics suitable for remote engineering teams?',
        answer: 'Extremely. Remote teams rely on asynchronous GitHub communication, making PR comments and review analytics even more critical for team health.'
      }
    ]
  }
};
