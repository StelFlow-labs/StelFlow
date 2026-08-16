import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

/**
 * VitePress over the existing docs/ folder.
 *
 * Chosen over Docusaurus for one reason that matters here: it renders the
 * markdown that is already in this repo, in place, with no per-page frontmatter
 * and no restructuring. Docusaurus wants an id/sidebar_position on each file and
 * its own directory shape; adopting it would mean editing every doc to suit the
 * tool. It is also a far smaller dependency footprint for what is a docs site
 * rather than an app.
 *
 * Mermaid is wired through vitepress-plugin-mermaid because two of these pages
 * carry diagrams and a docs site that silently drops them is not done.
 */
export default withMermaid(
  defineConfig({
    title: "StelFlow",
    description: "Payment streaming with milestone gates, on Stellar.",
    lang: "en-GB",
    cleanUrls: true,
    lastUpdated: true,

    // The site lives under /StelFlow/ on GitHub Pages. Change this if it ever
    // gets its own domain.
    base: "/StelFlow/",

    // Links to ../README resolve correctly on GitHub but point outside the site
    // root, so VitePress cannot check them. Issue #13 requires internal links to
    // work in BOTH places, so the markdown stays as it is and the checker is
    // told about this one shape rather than the docs being bent to suit the tool.
    ignoreDeadLinks: [/\.\.\/README/],

    head: [
      ["link", { rel: "icon", type: "image/svg+xml", href: "/StelFlow/logo.svg" }],
    ],

    themeConfig: {
      logo: "/logo.svg",
      outline: [2, 3],

      nav: [
        { text: "Concepts", link: "/concepts" },
        { text: "Architecture", link: "/architecture" },
        { text: "Specs", link: "/behaviour" },
        { text: "Research", link: "/threat-model" },
        {
          text: "Live on testnet",
          link: "https://stellar.expert/explorer/testnet/contract/CBUWKI666QTSYUSPWNGWN6HIE3EB6NHDQ3BDCACAT2ADQFCOYU57NRL7",
        },
      ],

      sidebar: [
        {
          text: "Start here",
          items: [
            { text: "Concepts", link: "/concepts" },
            { text: "Architecture", link: "/architecture" },
            { text: "Glossary", link: "/glossary" },
            { text: "FAQ", link: "/faq" },
          ],
        },
        {
          text: "Use cases",
          items: [
            { text: "DAO payroll", link: "/use-case-dao-payroll" },
            { text: "Grant disbursement", link: "/use-case-grant-disbursement" },
            { text: "Vesting with cliffs", link: "/use-case-vesting" },
          ],
        },
        {
          text: "Specification",
          items: [{ text: "Behaviour specs", link: "/behaviour" }],
        },
        {
          text: "Design decisions",
          items: [
            { text: "Threat model", link: "/threat-model" },
            { text: "Upgradeability and pause", link: "/upgradeability-and-pause" },
            { text: "Milestone revocation", link: "/milestone-revocation" },
            { text: "Milestone deadlines", link: "/milestone-deadlines" },
            { text: "TTL strategy", link: "/ttl-strategy" },
            { text: "Indexer design", link: "/indexer-design" },
          ],
        },
        {
          text: "Project",
          items: [
            { text: "Comparison", link: "/comparison" },
            { text: "Roadmap", link: "/ROADMAP" },
            { text: "Contributing", link: "/CONTRIBUTING" },
            { text: "Dev setup", link: "/dev-setup" },
            { text: "Security", link: "/SECURITY" },
            { text: "Code of conduct", link: "/CODE_OF_CONDUCT" },
            { text: "Contributors", link: "/CONTRIBUTORS" },
          ],
        },
      ],

      socialLinks: [
        { icon: "github", link: "https://github.com/StelFlow-labs/StelFlow" },
      ],

      editLink: {
        pattern:
          "https://github.com/StelFlow-labs/StelFlow/edit/main/docs/:path",
        text: "Edit this page on GitHub",
      },

      search: { provider: "local" },

      footer: {
        message:
          "Apache-2.0. Running on Stellar testnet, unaudited.",
        copyright: "StelFlow",
      },
    },
  }),
);
