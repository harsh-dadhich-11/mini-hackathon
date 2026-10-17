import "server-only";

// The Partner Summit 2026 question pack, from the CEO and partner Review Pack. Server-only: it holds the answer keys,
// and anything imported by a client component ships in a public JavaScript chunk.
// Loaded into the draft rounds with "Load Summit question pack" in the Master Questions tab.

export type PackRound = {
  id: string;
  scenario: string;
  context: string;
  leadHat: string;
  principle: string;
  options: { id: string; text: string }[];
  /** Boardroom #1, #2, #3. */
  answers: [string, string, string];
  evidence: [string, string, string];
  othersNote: string;
  followUp: string;
};

const options = (...texts: string[]) => texts.map((text, index) => ({ id: String.fromCharCode(65 + index), text }));

export const QUESTION_PACK: PackRound[] = [
  {
    id: "trial",
    scenario: "\u201cThe office coffee machine has died on the morning of the Partner Summit. 240 guests arrive in an hour.\u201d",
    context: "Practice round: nothing counts. You are the leadership team running the venue today.",
    leadHat: "People",
    principle: "Fix it for the customer first, then fix the machine.",
    options: options(
      "Order coffee from the caf\u00e9 next door for the first hour, and fix the machine after the rush",
      "Call the vendor's emergency line for a same-day repair",
      "Email every guest an apology before they arrive",
      "Put out tea, water and a friendly sign until coffee arrives",
      "Buy a bigger, smarter machine today so it never happens again",
      "Set up a working group to review the venue's beverage strategy",
    ),
    answers: ["A", "B", "D"],
    evidence: [
      "Guests arrive in an hour: solve their problem first, then the machine's.",
      "Start the repair now, so the fix is under way while the guests are looked after.",
      "Cheap, immediate and kind. It buys goodwill while the coffee arrives.",
    ],
    othersNote: "C: an apology without a fix just advertises the problem. E: a big purchase under pressure, and it won't arrive in an hour. F: a working group is how this game says \u201cnot today\u201d.",
    followUp: "",
  },
  {
    id: "round-1",
    scenario: "“A well-meaning senior engineer on your team pasted client source code into a public AI tool to debug faster. Your security tooling has flagged it.”",
    context: "You are the leadership team of a 2,000-person technology services company. Your ranked order is your sequence of actions.",
    leadHat: "Finance and Risk",
    principle: "Contain, disclose, then fix the system. In that order.",
    options: options(
      "Notify the client's security lead within 24 hours: what you know, what you don't, and when the next update comes",
      "Suspend the employee immediately, pending investigation, to show zero tolerance",
      "Complete the internal investigation first, so you disclose accurate facts",
      "Revoke the tool's access, ask the AI vendor to delete the data, and preserve the logs",
      "Block all external AI tools company-wide until a policy review is done",
      "Roll out sanctioned enterprise AI tools within 30 days so people have a safe alternative",
    ),
    answers: ["D", "A", "F"],
    evidence: [
      "Contain first: stop the exposure and preserve the evidence in the first hour.",
      "India's DPDP Rules 2025 require breach intimation without delay and a detailed report within 72 hours, with penalties up to ₹200 Cr for notification failures. Disclose structured facts, gaps and the next update time.",
      "59% of employees use unapproved AI tools, including 93% of executives. IBM 2025: 97% of organisations with AI-related breaches lacked AI access controls, and shadow-AI breaches cost $670K more than average.",
    ],
    othersNote: "B: prejudges what is usually a systemic failure; 57% of shadow-AI users say their managers support it. C: investigating before notifying risks missing the legal deadline. E: a blanket ban drives usage further underground.",
    followUp: "",
  },
  {
    id: "round-2",
    scenario: "“An AI agent can eliminate 35% of one team's current work. Go or no-go?”",
    context: "You are the leadership team of a technology services company. The team is 40 people on a time-and-materials contract and is already trained on the agent. The client hasn't raised AI yet.",
    leadHat: "Delivery and Technology",
    principle: "Disrupt yourself first, with guardrails.",
    options: options(
      "Go now on internal work only; extend to client work once the results are proven",
      "Reskill the whole team first, then deploy once they're ready",
      "Build the agent in-house so you own the IP and can resell it across clients",
      "Redeploy the freed 35% into the client's backlog and new scope, with no layoffs announced upfront",
      "Build a business case for an outcome-based commercial model that shares the productivity gain, and present it to the client",
      "Run a controlled pilot on one client workflow, with client sign-off and a human in the loop",
    ),
    answers: ["F", "E", "D"],
    evidence: [
      "It's a “go”, with governance. Scope it to a real workflow: MIT NANDA (2025) found 95% of enterprise GenAI pilots show no P&L impact.",
      "On time-and-materials, more productivity means less revenue unless the commercial model changes. Check the model works for you, then take it to the client before they ask for a rate cut.",
      "Keeps the revenue and the people, and builds trust for the next deployment.",
    ],
    othersNote: "A: safe, but it delays the commercial conversation the client will eventually start for you. B: the team is already trained, so reskilling first only delays what a real pilot will teach you. C: MIT found partnered or bought AI succeeds about twice as often as internal builds.",
    followUp: "",
  },
  {
    id: "round-3",
    scenario: "“Your top 4 architects, each with you for 6+ years, have resigned together to join a well-funded competitor offering 35% more. Together they anchor your 3 largest accounts.”",
    context: "You are the leadership team of a technology services company. Notice period is 60 days. Two of the three clients already know.",
    leadHat: "People",
    principle: "Diagnose before you pay. Fix the system, not just the symptom.",
    options: options(
      "Counteroffer all four at market rate today, with a 12-month retention bonus tied to successor readiness",
      "Hire senior external architects immediately and accept a 3–6 month ramp-up with temporary delivery risk",
      "CEO meets each of the four within 24 hours to find the real reason, then makes selective, reason-specific offers",
      "Name internal successors now; they shadow the leavers through the notice period, with client introductions in week 1",
      "Tell all three clients proactively, agree a continuity plan, and bring in a partner firm for interim architecture cover",
      "Re-band architect pay against the market and launch a technical career track to Distinguished Engineer",
    ),
    answers: ["C", "F", "D"],
    evidence: [
      "Four people leaving together for one competitor points to something specific: their leader, their growth path, or the market repricing them. Pay matters (72% cite it in PwC's survey), but two-thirds also weigh the chance to learn new skills. Diagnose first, then counter selectively.",
      "Four leaving at once is a system problem, not a one-person issue. Start fixing the pay band and the career path now, at least informally, or you can't keep anyone and you won't know who's staying.",
      "Once you know who's staying, name successors and let them shadow the leavers, so the client accounts are protected.",
    ],
    othersNote: "A: about 50% of people who accept a counteroffer still leave within 12 months (CEB/Gartner data cited in HBR), and blanket offers teach the firm that resigning gets you a raise. B: replacing someone costs 0.5–2x their salary (Gallup), and ramp-up takes longer than the notice period. E: telling clients is right, but leading with it assumes you've already lost the architects.",
    followUp: "",
  },
  {
    id: "round-4",
    scenario: "“Cut operating cost by 15% and increase delivery capacity by 20% within 12 months.”",
    context: "You are the leadership team of a 2,000-person technology services company, not the client. People are about 70% of cost, and most revenue sits on multi-year contracts.",
    leadHat: "Finance and Risk",
    principle: "Grow productivity, don't just cut cost.",
    options: options(
      "Offshore more roles: shift 20% of high-cost onshore roles to lower-cost locations over two quarters, with a knowledge-transfer overlap",
      "Redesign workflows with AI: rebuild the 5 highest-volume delivery workflows end-to-end around AI agents, then re-baseline staffing on the new workflow",
      "Raise utilisation: move from 75% to 85% by cutting bench and non-billable roles to benchmark, and fund growth from the freed cost",
      "Freeze hiring and travel now, then decide where to cut",
      "Prune the portfolio: exit or reprice low-margin work across both accounts and the offerings you're not winning at",
      "Zero-based budget: rebuild every cost line from zero, people and non-people, and fund the AI redesign from the savings",
    ),
    answers: ["B", "F", "A"],
    evidence: [
      "The only lever that cuts cost and adds capacity at the same time. McKinsey's State of AI 2025: high performers are nearly 3x as likely to fundamentally redesign workflows.",
      "Starting from zero makes every cost, people and non-people, earn its place, and funds the AI redesign. McKinsey: only about 10% of cost programmes still show results three years later, mostly because they trim rather than rebuild.",
      "Offshoring raises capacity per rupee: the same budget buys more delivery hours, which is exactly what the +20% needs. A knowledge-transfer overlap keeps quality intact.",
    ],
    othersNote: "C: the bench is your buffer for +20% capacity, and rising workload is a top reason people quit (PwC). D: a freeze is the tried-and-true first move, but it buys time rather than fixing cost or adding capacity. E: a strong near miss. Strategically you should cut low-margin work and offerings, but multi-year contracts make it slow to land inside 12 months.",
    followUp: "",
  },
  {
    id: "round-5",
    scenario: "“Your largest customer, with you for 4 years, says your offshore delivery team isn't taking enough ownership: problems surface late and nobody proposes fixes. Fix it in 30 days or they cut the contract by 30%.”",
    context: "You are the leadership team of the delivery company. Your team says it waits for direction; the client says it wants proactivity.",
    leadHat: "Business and Clients",
    principle: "Ownership grows from clear outcomes, trust and room to act.",
    options: options(
      "Put a senior delivery leader on-site to build trust with the client and coach the offshore team in agency and ownership",
      "Fly the Delivery Head in this week to apologise and present a recovery plan to the client's leadership",
      "Commission a formal governance review and present a 90-day transformation roadmap to the client's leadership",
      "Give offshore leads the authority and direct client access to act without waiting for approval",
      "Sit down with the client to define what “ownership” means and agree a 30-day action plan together, with 3–5 outcomes you'll be judged on",
      "CEO-to-CEO call to reset the relationship and personally sponsor the fix",
    ),
    answers: ["E", "A", "D"],
    evidence: [
      "You can't solve a problem the client hasn't articulated. Turning a passing complaint into a shared, measurable plan is the first move.",
      "Ownership grows from trust, and trust grows fastest through direct, in-person relationships. A senior leader on-site also coaches the team to act before being asked.",
      "Once trust is building, give the team room to act. Research on capability centres (McKinsey; Oliver Wyman with Nasscom) shows the highest-value centres moved from cost-arbitrage mandates to ownership mandates.",
    ],
    othersNote: "B: a visit and an apology help, but a one-off plan doesn't change how the team works on Monday. C: a 90-day roadmap answers a 30-day ultimatum with a process. F: a strong signal, but escalation without a mechanism leaves the team unchanged.",
    followUp: "The client says: “We don't need a plan, we need people who care.” What do you say?",
  },
  {
    id: "round-6",
    scenario: "“You're buying a 300-person, founder-led AI engineering firm as a strategic move to build your AI practice (not an acqui-hire). Due diligence is done and the deal is announced on Monday. What are your top three priorities for the first 100 days?”",
    context: "You are the leadership team of the acquiring company.",
    leadHat: "Business and Clients",
    principle: "In M&A you're buying people. Keep them, tell them the story, then build the plan.",
    options: options(
      "Key talent: retention packages and a named role in the new structure for the top 30 people",
      "Communicate a shared vision: from day one, paint the picture for both companies of why we're together and what we'll build",
      "Leadership stability: keep the acquired leadership team in place with clear mandates",
      "Understand what you bought: the work, the clients and the capabilities, turned into a 100-day integration and synergy plan",
      "Client relationships: no change to account teams or SLAs for 100 days",
      "Speed of integration: merge systems, teams and brand fast to capture synergies",
    ),
    answers: ["A", "B", "D"],
    evidence: [
      "You bought people, not desks. About 34% of acquired employees leave within the first year (UPenn research), and the best leave first.",
      "Poor communication and not seeing their place in the new organisation are top reasons acquired employees leave. A shared picture of why we're together keeps the people in #1.",
      "You can't integrate what you don't understand. Knowing the work, clients and capabilities you bought is what turns a deal into a synergy plan; about 70% of mergers miss their revenue synergies (McKinsey).",
    ],
    othersNote: "C: acquisitions often bring planned leadership changes, so stability isn't a goal in itself. E: important, but clients stay when the people and the plan are right. F: McKinsey warns that changing teams and client coverage too fast leads to sharp revenue declines.",
    followUp: "Your best acquired engineer asks you on day one: “Will my job change?” What do you say?",
  },
];
