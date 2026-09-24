type Prospect = {
  rank: number;
  name: string;
  does: string;
  contact: string;
  fit: string;
};

const tiers: Record<number, Prospect[]> = {
  1: [
    { rank: 1, name: 'Retell AI', does: 'AI voice agents for phone calls', contact: 'support@retellai.com', fit: 'Repeated call context and tool schemas' },
    { rank: 2, name: 'Vapi', does: 'Voice-agent infrastructure for developers', contact: 'Official sales/contact route', fit: 'Multi-turn calls and function calling' },
    { rank: 3, name: 'Bland AI', does: 'Large-scale autonomous phone agents', contact: 'Official sales/contact route', fit: 'High-volume conversation history' },
    { rank: 4, name: 'PolyAI', does: 'Enterprise contact-center voice AI', contact: 'Official sales/contact route', fit: 'Long service workflows at scale' },
    { rank: 5, name: 'Cognigy', does: 'Omnichannel enterprise agent automation', contact: 'Official sales/contact route', fit: 'Complex integrations and prompts' },
    { rank: 6, name: 'ElevenLabs', does: 'Voice generation and AI voice agents', contact: 'Official sales/contact route', fit: 'Agent context plus content volume' },
    { rank: 7, name: 'Deepgram', does: 'Speech recognition and voice AI APIs', contact: 'Official sales/contact route', fit: 'Speech pipelines with LLM layers' },
    { rank: 8, name: 'AssemblyAI', does: 'Audio intelligence and transcription APIs', contact: 'Official sales/contact route', fit: 'Analysis and summarization calls' },
    { rank: 9, name: 'LivePerson', does: 'Conversational customer-service automation', contact: 'Official sales/contact route', fit: 'High-volume support sessions' },
    { rank: 10, name: 'Kore.ai', does: 'Enterprise conversational AI and orchestration', contact: 'Official sales/contact route', fit: 'Multi-channel agent workflows' },
  ],
  2: [
    { rank: 11, name: 'Observe.AI', does: 'Contact-center conversation intelligence', contact: 'Official sales/contact route', fit: 'Transcripts, QA, and agent assist' },
    { rank: 12, name: 'Cresta', does: 'Real-time contact-center AI', contact: 'Official sales/contact route', fit: 'Live agent context and coaching' },
    { rank: 13, name: 'Sierra', does: 'Enterprise customer-experience agents', contact: 'Official sales/contact route', fit: 'Long-running tool-enabled agents' },
    { rank: 14, name: 'Decagon', does: 'AI customer-support agents', contact: 'Official sales/contact route', fit: 'High-volume support context' },
    { rank: 15, name: 'Ada', does: 'Automated customer-service AI', contact: 'Official sales/contact route', fit: 'Repeated support conversations' },
    { rank: 16, name: 'Intercom', does: 'AI customer support with Fin', contact: 'Official sales/contact route', fit: 'Tickets, knowledge, and history' },
    { rank: 17, name: 'Zendesk', does: 'Customer-service and agent-assist software', contact: 'Official sales/contact route', fit: 'Ticket and help-center context' },
    { rank: 18, name: 'Glean', does: 'Enterprise search and knowledge agents', contact: 'Official sales/contact route', fit: 'Large retrieval context windows' },
    { rank: 19, name: 'Relevance AI', does: 'Business agents and workflow automation', contact: 'Official sales/contact route', fit: 'Chained model calls and tools' },
    { rank: 20, name: 'Lindy', does: 'Personal and business AI assistants', contact: 'Official sales/contact route', fit: 'Persistent email and task context' },
  ],
  3: [
    { rank: 21, name: 'Gumloop', does: 'Visual AI workflow automation', contact: 'Official sales/contact route', fit: 'Repeated chained model calls' },
    { rank: 22, name: 'Dust', does: 'Custom enterprise assistants', contact: 'Official sales/contact route', fit: 'Knowledge and tool-connected agents' },
    { rank: 23, name: 'LangChain', does: 'LLM and agent orchestration tooling', contact: 'Official sales/contact route', fit: 'Prompt, tool, and trace overhead' },
    { rank: 24, name: 'Writer', does: 'Enterprise generative AI platform', contact: 'Official sales/contact route', fit: 'Brand and knowledge context' },
    { rank: 25, name: 'Harvey', does: 'AI workflows for legal professionals', contact: 'Official sales/contact route', fit: 'Long legal-document context' },
    { rank: 26, name: 'Hebbia', does: 'Document research and analysis AI', contact: 'Official sales/contact route', fit: 'Large document and query context' },
    { rank: 27, name: 'Clay', does: 'AI prospecting and data enrichment', contact: 'Official sales/contact route', fit: 'High-volume enrichment prompts' },
    { rank: 28, name: 'Regie.ai', does: 'AI sales engagement workflows', contact: 'Official sales/contact route', fit: 'Personalization and campaign context' },
    { rank: 29, name: 'Copy.ai', does: 'Enterprise marketing workflow automation', contact: 'Official sales/contact route', fit: 'High-volume content generation' },
    { rank: 30, name: 'Jasper', does: 'AI marketing content platform', contact: 'Official sales/contact route', fit: 'Repeated brand instructions' },
  ],
  4: [
    { rank: 31, name: 'Typeface', does: 'Enterprise branded content creation', contact: 'Official sales/contact route', fit: 'Campaign and brand-context repetition' },
    { rank: 32, name: 'Salesforce', does: 'CRM and Agentforce workflows', contact: 'Official sales/contact route', fit: 'CRM records, tools, and agents' },
    { rank: 33, name: 'ServiceNow', does: 'Enterprise IT and workflow automation', contact: 'Official sales/contact route', fit: 'Large operational record context' },
    { rank: 34, name: 'UiPath', does: 'AI-powered business-process automation', contact: 'Official sales/contact route', fit: 'Agent and system orchestration' },
    { rank: 35, name: 'Automation Anywhere', does: 'Enterprise intelligent automation', contact: 'Official sales/contact route', fit: 'Repeated process and tool context' },
    { rank: 36, name: 'HubSpot', does: 'CRM, sales, marketing, and service AI', contact: 'Official sales/contact route', fit: 'Customer and campaign context' },
    { rank: 37, name: 'Gong', does: 'Revenue and conversation intelligence', contact: 'Official sales/contact route', fit: 'Transcript and deal analysis' },
    { rank: 38, name: 'Dialpad', does: 'AI voice, meetings, and contact center', contact: 'Official sales/contact route', fit: 'Live conversation and summary calls' },
    { rank: 39, name: 'Unify', does: 'AI-assisted outbound sales workflows', contact: 'Official sales/contact route', fit: 'Prospect research and personalization' },
    { rank: 40, name: 'Cursor / Anysphere', does: 'AI coding assistant for repositories', contact: 'Official sales/contact route', fit: 'Persistent codebase context' },
  ],
  5: [
    { rank: 41, name: 'Windsurf / Codeium', does: 'AI coding and developer agents', contact: 'Official sales/contact route', fit: 'Large project and chat context' },
    { rank: 42, name: 'Sourcegraph', does: 'Code search and Cody development AI', contact: 'Official sales/contact route', fit: 'Repository-scale context windows' },
    { rank: 43, name: 'Cognition', does: 'Autonomous software agents', contact: 'Official sales/contact route', fit: 'Long-running multi-step context' },
    { rank: 44, name: 'Synthesia', does: 'Enterprise AI video production', contact: 'Official sales/contact route', fit: 'Scripts, localization, and workflows' },
    { rank: 45, name: 'HeyGen', does: 'AI video creation and translation', contact: 'Official sales/contact route', fit: 'High-volume creative generation' },
    { rank: 46, name: 'Descript', does: 'AI audio and video editing', contact: 'Official sales/contact route', fit: 'Transcription and content workflows' },
    { rank: 47, name: 'Runway', does: 'Generative media production', contact: 'Official sales/contact route', fit: 'Repeated creative iteration' },
    { rank: 48, name: 'Pika', does: 'Generative video creation', contact: 'Official sales/contact route', fit: 'High-volume generation requests' },
    { rank: 49, name: 'Suno', does: 'AI music generation', contact: 'Official sales/contact route', fit: 'Prompt and iteration volume' },
    { rank: 50, name: 'Udio', does: 'AI music generation and remixing', contact: 'Official sales/contact route', fit: 'Repeated user sessions' },
  ],
};

export default function ProspectTier({
  tier,
  title,
  subtitle,
}: {
  tier: number;
  title: string;
  subtitle: string;
}) {
  const prospects = tiers[tier] ?? [];
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0c080f] px-[5vw] py-[5vh] text-[#f0ece4]">
      <div className="font-body text-[.95vw] tracking-[.2em] text-[#9b8bb4]">
        {String(9 + tier).padStart(2, '0')}{' '}
        <span className="text-[#c4a060]">—</span> RANKED PROSPECTS ·{' '}
        {tier === 1 ? 'HIGHEST DIRECT FIT' : 'NEXT-BEST FIT'}
      </div>
      <div className="mt-[2.6vh] flex items-end justify-between">
        <div>
          <h2 className="font-display text-[3.4vw] leading-[1.05]">{title}</h2>
          <p className="mt-[1vh] font-body text-[1.05vw] text-[#9b8bb4]">{subtitle}</p>
        </div>
        <div className="font-body text-[1vw] tracking-[.1em] text-[#c4a060]">
          {prospects[0]?.rank}—{prospects[prospects.length - 1]?.rank}
        </div>
      </div>
      <div className="mt-[3.5vh] grid grid-cols-[.7fr_1.55fr_1.05fr_1.35fr] border-y border-[#9b8bb4]/30 font-body text-[.78vw] leading-[1.15]">
        <div className="border-r border-[#9b8bb4]/20 px-[.8vw] py-[1.2vh] text-[#c4a060]">RANK / COMPANY</div>
        <div className="border-r border-[#9b8bb4]/20 px-[.8vw] py-[1.2vh] text-[#c4a060]">WHAT THEY DO</div>
        <div className="border-r border-[#9b8bb4]/20 px-[.8vw] py-[1.2vh] text-[#c4a060]">EMAIL / CONTACT ROUTE</div>
        <div className="px-[.8vw] py-[1.2vh] text-[#c4a060]">WHY GKA FITS</div>
        {prospects.map((prospect) => (
          <div key={prospect.rank} className="contents">
            <div className="border-r border-t border-[#9b8bb4]/15 px-[.8vw] py-[1.35vh] font-semibold text-[#f0ece4]">
              <span className="text-[#c4a060]">{String(prospect.rank).padStart(2, '0')}</span>
              <br />
              {prospect.name}
            </div>
            <div className="border-r border-t border-[#9b8bb4]/15 px-[.8vw] py-[1.35vh] text-[#f0ece4]">{prospect.does}</div>
            <div className="border-r border-t border-[#9b8bb4]/15 px-[.8vw] py-[1.35vh] text-[#9b8bb4]">{prospect.contact}</div>
            <div className="border-t border-[#9b8bb4]/15 px-[.8vw] py-[1.35vh] text-[#f0ece4]">{prospect.fit}</div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-[3.5vh] left-[5vw] right-[5vw] flex justify-between font-body text-[.72vw] tracking-[.06em] text-[#9b8bb4]">
        <span>Public email addresses are shown only when verified from an official source.</span>
        <span>gravelkingpro.com · GKA prospecting brief</span>
      </div>
    </div>
  );
}