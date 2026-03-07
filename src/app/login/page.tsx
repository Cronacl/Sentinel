import { AuthScreen } from "@/components/auth/AuthScreen";

export default function LoginPage() {
	return (
		<AuthScreen
			alternateHref="/signup"
			alternateLabel="Need an account?"
			description="Simple, focused access to the Sentinel workspace."
			title="Log in to Sentinel"
		/>
	);
}
