import "./globals.css";

export const metadata = {
  title: "MLN Catalogs",
  description: "Gerador de feed de catálogo para o TikTok",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
