import Head from "next/head";

export const PageHead = ({ title }: { title: string }) => {
  const brandedTitle = title.replace(/Kan\.bn|kan\.bn/g, "GSD");

  return (
    <Head>
      <title>{brandedTitle}</title>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
      <link rel="icon" href="/favicon.png" type="image/png" />
      <link rel="shortcut icon" href="/favicon.png" type="image/png" />
      <link rel="apple-touch-icon" href="/icon-512.png" />
      <link rel="manifest" href="/manifest.json" />
    </Head>
  );
};
