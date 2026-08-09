/** RIGTIGT uddrag af Anchor-feedet (https://anchor.fm/s/101a8bd38/podcast/rss,
    hentet 2026-08-09) — item 1 er ordret fra feedet (forkortet description);
    item 2-3 følger samme form (item 3 mangler bevidst duration/image/guid
    for graceful-null-testene). Fixturen LÅSER formatantagelserne fast. */
export const PODCAST_FEED_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?><rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0" xmlns:anchor="https://anchor.fm/xmlns" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
	<channel>
		<title><![CDATA[IVÆRKSÆTTERLIVET]]></title>
		<link>https://www.topix.dk/</link>
		<lastBuildDate>Sun, 09 Aug 2026 12:54:46 GMT</lastBuildDate>
		<itunes:image href="https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_nologo/43128030/43128030-1756728848385-a8b1ff48959d3.jpg"/>
		<item>
			<title><![CDATA[Når livet rammer: Iværksætteri, sorg og nye begyndelser med Kasper Bisgaard]]></title>
			<description><![CDATA[<p>I denne samtale dykker vi ned i Kasper Bisgaards rejse fra skibums til iværksætter.</p>]]></description>
			<link>https://podcasters.spotify.com/pod/show/topixdk/episodes/Nr-livet-rammer-Ivrkstteri--sorg-og-nye-begyndelser-med-Kasper-Bisgaard-e38b63n</link>
			<guid isPermaLink="false">77b961d7-c835-4151-820d-1cd388d92fa5</guid>
			<pubDate>Wed, 17 Sep 2025 07:10:31 GMT</pubDate>
			<enclosure url="https://anchor.fm/s/101a8bd38/podcast/play/108418615/episode1.mp3" length="45294235" type="audio/mpeg"/>
			<itunes:duration>00:47:10</itunes:duration>
			<itunes:image href="https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_episode/43128030/episode1.jpg"/>
			<itunes:season>2</itunes:season>
			<itunes:episode>2</itunes:episode>
			<itunes:episodeType>full</itunes:episodeType>
		</item>
		<item>
			<title><![CDATA[Andet afsnit — moms, løn og alt det kedelige]]></title>
			<description><![CDATA[<p>Vi taler bogholderi.</p>]]></description>
			<link>https://podcasters.spotify.com/pod/show/topixdk/episodes/andet-afsnit</link>
			<guid isPermaLink="false">aaaa1111-2222-3333-4444-555566667777</guid>
			<pubDate>Wed, 10 Sep 2025 06:00:00 GMT</pubDate>
			<enclosure url="https://anchor.fm/s/101a8bd38/podcast/play/108000000/episode2.mp3" length="30000000" type="audio/mpeg"/>
			<itunes:duration>32:05</itunes:duration>
			<itunes:image href="https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_episode/43128030/episode2.jpg"/>
		</item>
		<item>
			<title><![CDATA[Sparsomt afsnit uden metadata]]></title>
			<enclosure url="https://anchor.fm/s/101a8bd38/podcast/play/107000000/episode3.mp3" length="20000000" type="audio/mpeg"/>
		</item>
	</channel>
</rss>`;
