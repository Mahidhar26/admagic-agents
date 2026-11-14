import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-2xl">
      <h1>AdMagic Validator + Affiliates</h1>
      <p className="mb-4">Validate any Meta ad in one click, then pay the people who sell it, all with Qatom receipts.</p>
      <ol className="list-decimal pl-5 space-y-1 text-sm">
        <li>Load the Chrome extension from <code>extension/dist</code> and pair it from the <Link className="underline" href="/activity">Activity</Link> page.</li>
        <li>Open the Meta Ad Library and click <b>Validate</b> on any ad.</li>
        <li>Turn a winner into an offer on <Link className="underline" href="/affiliates">Affiliates</Link>; creators, agencies and AI agents earn per verified result.</li>
      </ol>
    </div>
  );
}
