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
    title: 'GitHub Insights & Analytics | GitRanked',
    metaDescription: 'Get deep GitHub insights and analytics for your engineering team. Track performance, unblock reviews, and measure true impact with AI-driven metrics.',
    heroTitle: 'DEEP GITHUB',
    heroHighlight: 'INSIGHTS',
    heroSubtitle: 'Go beyond basic commit counts. Understand how your engineering team really operates, identifies bottlenecks, and ships software faster with advanced GitHub insights.',
    sections: [
      {
        title: 'What are GitHub Insights?',
        content: 'GitHub Insights provide visibility into your engineering workflows. They help engineering managers and team leads understand collaboration patterns, code review velocity, and overall repository health. Instead of relying on gut feelings, you can use hard data to see where your team excels and where they are getting stuck.'
      },
      {
        title: 'Why Basic Metrics Aren\'t Enough',
        content: 'Tracking just the number of commits or lines of code is a flawed approach. It encourages bad habits and doesn\'t measure true value. Advanced GitHub Insights look at the quality of reviews, the complexity of pull requests, and how knowledge is distributed across the team. GitRanked uses AI to parse this data and provide actionable summaries.'
      },
      {
        title: 'Key Metrics to Track',
        content: 'Focus on metrics that matter: PR Cycle Time, Code Churn, Review Turnaround, and Contributor Impact. By monitoring these areas, you can identify hidden champions on your team—the people who review code, fix bugs, and keep the engine running smoothly.'
      }
    ],
    faqs: [
      {
        question: 'How do I get GitHub insights for my repository?',
        answer: 'You can install a tool like GitRanked on your GitHub repository. Once connected, it automatically analyzes your PRs, commits, and reviews to generate comprehensive insights.'
      },
      {
        question: 'Are GitHub insights private?',
        answer: 'Yes, tools like GitRanked require your permission to access repository data and keep your insights private to your team members.'
      }
    ]
  },
  'pr-review-metrics': {
    slug: 'pr-review-metrics',
    title: 'PR Review Metrics & Analytics | GitRanked',
    metaDescription: 'Track and optimize your pull request review metrics. Reduce cycle time, prevent burnout, and improve code quality with advanced PR analytics.',
    heroTitle: 'PULL REQUEST',
    heroHighlight: 'METRICS',
    heroSubtitle: 'Code reviews shouldn\'t be a black hole. Track PR cycle times, review turnaround, and identify bottlenecks in your engineering pipeline.',
    sections: [
      {
        title: 'The Importance of PR Review Metrics',
        content: 'Pull Request (PR) reviews are critical for maintaining code quality, but they are often the biggest bottleneck in the software development lifecycle. Tracking PR review metrics helps you understand how long it takes for code to go from written to merged, and who is carrying the load of reviewing.'
      },
      {
        title: 'Key PR Metrics You Should Monitor',
        content: 'Essential metrics include Time to First Review (how long a PR sits waiting), Review Cycle Time (total time in review), and Reviewer Burden (how many PRs a single person is asked to review). Balancing these metrics ensures smooth delivery and prevents burnout among senior engineers.'
      },
      {
        title: 'How to Improve Code Review Velocity',
        content: 'Encourage smaller PRs, set clear expectations for review turnaround, and use automated tools to handle linting and basic checks before a human ever looks at the code. GitRanked helps you visualize these metrics so you can pinpoint exactly where the delays are happening.'
      }
    ],
    faqs: [
      {
        question: 'What is a good PR cycle time?',
        answer: 'A healthy PR cycle time is typically under 48 hours. If PRs are taking longer, it often indicates they are too large or the team is bottlenecked on reviews.'
      },
      {
        question: 'How can I track PR metrics automatically?',
        answer: 'You can use GitRanked to automatically ingest GitHub webhooks and generate real-time dashboards of your PR review metrics without any manual tracking.'
      }
    ]
  },
  'repository-health': {
    slug: 'repository-health',
    title: 'GitHub Repository Health Check | GitRanked',
    metaDescription: 'Measure your GitHub repository health. Analyze collaboration, code quality, and delivery speed to ensure your engineering team is performing at its best.',
    heroTitle: 'REPOSITORY',
    heroHighlight: 'HEALTH',
    heroSubtitle: 'Is your codebase thriving or surviving? Measure collaboration, delivery speed, and overall repository health with GitRanked.',
    sections: [
      {
        title: 'What is Repository Health?',
        content: 'Repository health is a holistic measure of how sustainable and active a software project is. It goes beyond simple activity metrics to evaluate how well a team collaborates, how quickly issues are resolved, and how knowledge is shared across the codebase.'
      },
      {
        title: 'Signs of a Healthy Repository',
        content: 'A healthy repository has a fast PR turnaround, evenly distributed knowledge (no single points of failure), active discussions on pull requests, and regular, predictable releases. Unhealthy repositories often suffer from stalled PRs, siloed knowledge, and high code churn.'
      },
      {
        title: 'Using AI to Measure Health',
        content: 'GitRanked analyzes the raw events of your repository—every comment, review, and merge—to compute a comprehensive health score. We break this down into Code Quality, Collaboration, Delivery, and Review Health so you know exactly where to improve.'
      }
    ],
    faqs: [
      {
        question: 'How do you measure repository health?',
        answer: 'Health is measured by analyzing PR cycle times, the ratio of comments to merges, code churn, and how evenly work is distributed among contributors.'
      },
      {
        question: 'Why does repository health matter?',
        answer: 'Poor repository health leads to slower feature delivery, higher bug rates, and engineering burnout. Tracking it helps managers intervene before problems become critical.'
      }
    ]
  },
  'engineering-metrics': {
    slug: 'engineering-metrics',
    title: 'Engineering Metrics Dashboard | GitRanked',
    metaDescription: 'The ultimate engineering metrics dashboard. Track DORA metrics, team velocity, and developer productivity with our AI-powered analytics platform.',
    heroTitle: 'ENGINEERING',
    heroHighlight: 'METRICS',
    heroSubtitle: 'Stop guessing about your team\'s performance. Get actionable engineering metrics that measure impact, not just activity.',
    sections: [
      {
        title: 'The Shift in Engineering Metrics',
        content: 'Modern engineering teams have moved away from counting lines of code or story points. Today, the focus is on DORA metrics (Deployment Frequency, Lead Time for Changes, Mean Time to Recovery, Change Failure Rate) and developer experience metrics.'
      },
      {
        title: 'Why Dashboards Fail',
        content: 'Many engineering dashboards fail because they present raw data without context. Seeing that 50 PRs were merged doesn\'t tell you if the team is working well or if they just merged a bunch of typo fixes. GitRanked provides context by using AI to summarize the actual impact of those merges.'
      },
      {
        title: 'Building a Metrics-Driven Culture',
        content: 'To build a healthy culture, metrics should be used for team improvement, not individual punishment. Use dashboards to celebrate wins, identify process bottlenecks, and advocate for technical debt reduction.'
      }
    ],
    faqs: [
      {
        question: 'What are the most important engineering metrics?',
        answer: 'The most important metrics track delivery speed (PR cycle time, lead time) and quality (review depth, code churn). Together, these provide a balanced view of performance.'
      },
      {
        question: 'How do I implement an engineering metrics dashboard?',
        answer: 'You can build your own using GitHub APIs, or you can use a plug-and-play solution like GitRanked to get a fully populated dashboard in minutes.'
      }
    ]
  },
  'github-contributor-analytics': {
    slug: 'github-contributor-analytics',
    title: 'GitHub Contributor Analytics | GitRanked',
    metaDescription: 'Analyze GitHub contributor performance. Discover who the true architects, reviewers, and maintainers are on your engineering team.',
    heroTitle: 'CONTRIBUTOR',
    heroHighlight: 'ANALYTICS',
    heroSubtitle: 'Understand who really drives your project forward. Analyze contributor impact, review habits, and coding patterns with deep GitHub analytics.',
    sections: [
      {
        title: 'Beyond the Commit Count',
        content: 'Contributor analytics traditionally focus on who writes the most code. However, the most valuable engineers are often those who review code, mentor others, and tackle complex architectural challenges. GitRanked looks at the complete picture of a contributor\'s impact.'
      },
      {
        title: 'Identifying Contributor Personas',
        content: 'By analyzing GitHub activity, we can categorize contributors into personas. Are they a "Reviewer" who ensures quality? An "Architect" who tackles massive refactors? Or a "Sprinter" who ships dozens of small features? Understanding these roles helps managers allocate tasks effectively.'
      },
      {
        title: 'Fair Performance Evaluations',
        content: 'Performance reviews are notoriously subjective. By bringing objective contributor analytics into the conversation, you can ensure that "glue work" (like PR reviews and answering questions) is recognized and rewarded alongside shipping features.'
      }
    ],
    faqs: [
      {
        question: 'How can I see contributor stats on GitHub?',
        answer: 'GitHub provides basic graphs under the "Insights" tab. For deep analytics on review quality and specific contributor personas, you need a specialized tool like GitRanked.'
      },
      {
        question: 'Should I use contributor analytics for performance reviews?',
        answer: 'They should be used as one data point among many. They are excellent for highlighting unseen work like code reviews, but should never replace human judgment and context.'
      }
    ]
  }
};
