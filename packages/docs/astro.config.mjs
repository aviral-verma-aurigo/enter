// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://enter.example.com",
  integrations: [
    starlight({
      title: "Enter",
      description:
        "An autonomous teammate that turns conversations into pull requests. For engineers, PMs, designers, and QA — across CLI and Microsoft Teams.",
      social: {
        github: "https://github.com/your-org/enter",
      },
      favicon: "/favicon.svg",
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "intro" },
            { label: "Quickstart", slug: "quickstart" },
            { label: "Who Contributes", slug: "contributors" },
            { label: "Distinctive Features", slug: "differs" },
          ],
        },
        {
          label: "Core Concepts",
          items: [
            { label: "Memory & Entity Graph", slug: "concepts/memory" },
            { label: "Autonomous Loop", slug: "concepts/autonomy" },
            { label: "Skills", slug: "concepts/skills" },
            { label: "Delegation to Claude Code", slug: "concepts/delegation" },
          ],
        },
        {
          label: "Usage",
          items: [
            { label: "CLI", slug: "usage/cli" },
            { label: "Slash Commands", slug: "usage/slash" },
            { label: "Interactive TUI", slug: "usage/tui" },
            { label: "Teams Bot", slug: "usage/teams-bot" },
          ],
        },
        {
          label: "Configuration",
          items: [
            { label: "Config File", slug: "config/file" },
            { label: "Environment Variables", slug: "config/env" },
            { label: "SOUL.md Persona", slug: "config/soul" },
            { label: "Skills Authoring", slug: "config/skills" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Tool Reference", slug: "reference/tools" },
            { label: "Memory & Graph Schema", slug: "reference/schema" },
            { label: "Session Format", slug: "reference/session" },
          ],
        },
        {
          label: "Deployment",
          items: [
            { label: "CLI on Your Machine", slug: "deploy/cli" },
            { label: "Teams Bot", slug: "deploy/teams-bot" },
            { label: "GitHub App Setup", slug: "deploy/github-app" },
            { label: "Repository Settings", slug: "deploy/repo-settings" },
          ],
        },
        {
          label: "Troubleshooting",
          items: [{ label: "FAQ", slug: "faq" }],
        },
      ],
    }),
  ],
});
