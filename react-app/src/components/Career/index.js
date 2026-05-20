import { useState } from 'react';

const EMAIL = 'julie.li.realtor@gmail.com';

const roles = [
	{
		title: "Co-Founder & CTO",
		tag: "Technology",
		comp: "Milestone-Based Equity Vesting",
		desc: "Lead all technical architecture and product development for the Tourit platform.",
		bullets: [
			"Design and build the core Tourit platform: real-time agent-matching engine, instant showing-booking flow, and buyer-facing search and booking UI.",
			"Integrate third-party infrastructure partners (BrokerBay API, Realm, MLS data feed) to power the instant-confirmation showing layer.",
			"Build and maintain the AI layer: smart listing recommendations (2 similar listings per booking), automated post-showing follow-up sequences, and AI-powered CRM tools for realtors.",
			"Develop the realtor-facing Chrome Extension enabling social media reposting (FBMP, Kijiji, RedNote, Karrot, TikTok, Instagram) as a realtor acquisition and retention tool.",
			"Ensure platform scalability, security, and RECO/REBBA compliance; manage data infrastructure including MLS feeds and buyer/agent data handling.",
			"Collaborate on strategic product decisions while acknowledging the Founder's final decision-making authority during the vesting period.",
		],
	},
	{
		title: "Co-Founder & CGO",
		tag: "Growth",
		comp: "Milestone-Based Equity Vesting",
		desc: "Drive organic growth and scale Tourit's top-of-funnel acquisition across the GTA market.",
		bullets: [
			"Cold Email Outreach: design, execute, and continuously optimize cold email campaigns targeting GTA real estate agents, brokerages, and prospective buyer/seller leads to drive platform adoption.",
			"Influencer & Affiliate Management: identify, recruit, onboard, and manage relationships with real estate influencers, content creators, and affiliate partners; structure performance-based compensation and track ROI.",
			"Social Media Infrastructure: build and maintain Tourit's social media presence across all relevant platforms (Instagram, TikTok, RedNote, Facebook, LinkedIn, YouTube, etc.); own content calendar, posting cadence, community management, and engagement.",
			"GEO & SEO: own search-engine and generative-engine optimization for tourit.ca — including keyword strategy, on-page/technical SEO, content production, backlink building, and ensuring Tourit is discoverable and surfaced by AI assistants and search engines.",
			"Any & All Organic Growth Channels: own user acquisition, market distribution (GTA real estate), and revenue growth toward the Year 1 Revenue Target of $150,000, including any additional organic channels (referrals, partnerships, community, PR, events) required to hit the milestones.",
			"Collaborate on strategic go-to-market decisions while acknowledging the Founder's final decision-making authority during the vesting period.",
		],
	},
];

const tagColor = {
	Technology: "bg-blue-50 text-blue-700",
	Growth:     "bg-emerald-50 text-emerald-700",
};

const ApplyModal = ({ role, onClose }) => (
	<div
		className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
		onClick={onClose}
	>
		<div
			className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full"
			onClick={e => e.stopPropagation()}
		>
			<h2 className="text-lg font-bold text-[#1a1a18] mb-1">Apply for {role.title}</h2>
			<p className="text-sm text-gray-500 mb-6">Send us an email introducing yourself and why you're the right fit.</p>
			<a
				href={`mailto:${EMAIL}?subject=Application: ${role.title}`}
				className="block w-full text-center bg-[#1a1a18] text-white text-sm font-semibold px-5 py-3 rounded-xl hover:bg-[#2d2d2a] transition-colors mb-3"
			>
				Email Us →
			</a>
			<p className="text-center text-xs text-gray-400">{EMAIL}</p>
			<button
				onClick={onClose}
				className="mt-4 block w-full text-center text-xs text-gray-400 hover:text-gray-600"
			>
				Close
			</button>
		</div>
	</div>
);

const Career = () => {
	const [applying, setApplying] = useState(null);

	return (
		<div className="min-h-screen bg-[#f9f9f7] font-sans">
			{applying && <ApplyModal role={applying} onClose={() => setApplying(null)} />}

			{/* Hero */}
			<div className="bg-[#1a1a18] px-6 py-16 text-center">
				<p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-3">We're Hiring</p>
				<h1 className="text-3xl md:text-4xl font-bold text-white mb-4">Join Us at Tourit</h1>
				<p className="text-gray-400 max-w-xl mx-auto text-base leading-relaxed">
					We're building the fastest way to book a home showing in the GTA. Looking for co-founders who want to own a piece of something real.
				</p>
			</div>

			{/* Job cards */}
			<div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
				{roles.map((role) => (
					<div key={role.title} className="bg-white rounded-2xl shadow-sm border border-[#ebebea] overflow-hidden">
						<div className="px-8 py-6 border-b border-[#f0f0ec]">
							<div className="flex flex-wrap items-center gap-3 mb-2">
								<span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tagColor[role.tag]}`}>
									{role.tag}
								</span>
								<span className="text-xs text-gray-400">Toronto, ON · Remote-friendly</span>
							</div>
							<h2 className="text-xl font-bold text-[#1a1a18]">{role.title}</h2>
							<p className="text-sm text-gray-500 mt-1">{role.desc}</p>
						</div>

						<div className="px-8 py-6">
							<h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Responsibilities</h3>
							<ul className="space-y-3">
								{role.bullets.map((b, i) => (
									<li key={i} className="flex gap-3 text-sm text-gray-700 leading-relaxed">
										<span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
										{b}
									</li>
								))}
							</ul>
						</div>

						<div className="px-8 py-5 bg-[#f9f9f7] border-t border-[#f0f0ec] flex flex-wrap items-center justify-between gap-4">
							<div>
								<p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Compensation</p>
								<p className="text-sm font-semibold text-[#1a1a18]">{role.comp}</p>
							</div>
							<button
								onClick={() => setApplying(role)}
								className="inline-flex items-center gap-2 bg-[#1a1a18] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#2d2d2a] transition-colors"
							>
								Apply Now
							</button>
						</div>
					</div>
				))}
			</div>

			<p className="text-center text-xs text-gray-400 pb-12">
				Questions? Email us at{" "}
				<a href={`mailto:${EMAIL}`} className="underline">{EMAIL}</a>
			</p>
		</div>
	);
};

export default Career;
