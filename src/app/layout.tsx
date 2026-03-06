import "@/styles/globals.css";

import type { Metadata } from "next";
import localFont from "next/font/local";

import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
	title: "Sentinel",
	description: "Backend foundation for the Cronacl rewrite in Sentinel.",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const satoshi = localFont({
	src: [
		{
			path: "./fonts/Satoshi-Light.woff2",
			weight: "300",
			style: "normal",
		},
		{
			path: "./fonts/Satoshi-LightItalic.woff2",
			weight: "300",
			style: "italic",
		},
		{
			path: "./fonts/Satoshi-Regular.woff2",
			weight: "400",
			style: "normal",
		},
		{
			path: "./fonts/Satoshi-Italic.woff2",
			weight: "400",
			style: "italic",
		},
		{
			path: "./fonts/Satoshi-Medium.woff2",
			weight: "500",
			style: "normal",
		},
		{
			path: "./fonts/Satoshi-MediumItalic.woff2",
			weight: "500",
			style: "italic",
		},
		{
			path: "./fonts/Satoshi-Bold.woff2",
			weight: "700",
			style: "normal",
		},
		{
			path: "./fonts/Satoshi-BoldItalic.woff2",
			weight: "700",
			style: "italic",
		},
		{
			path: "./fonts/Satoshi-Black.woff2",
			weight: "900",
			style: "normal",
		},
		{
			path: "./fonts/Satoshi-BlackItalic.woff2",
			weight: "900",
			style: "italic",
		},
	],
	variable: "--font-satoshi",
});

const millionaire = localFont({
	src: [
		{
			path: "./fonts/Millionaire-Roman.woff2",
			weight: "400",
			style: "normal",
		},
	],
	variable: "--font-millionaire",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			className={`${satoshi.variable} ${millionaire.variable}`}
			lang="en"
			suppressHydrationWarning
		>
			<body>
				<TRPCReactProvider>{children}</TRPCReactProvider>
			</body>
		</html>
	);
}
