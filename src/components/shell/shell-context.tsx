"use client";

import { usePathname } from "next/navigation";
import {
	type PropsWithChildren,
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

interface ShellContextValue {
	leftSidebarOpen: boolean;
	toggleLeftSidebar: () => void;
	setLeftSidebarOpen: (open: boolean) => void;

	rightSidebarOpen: boolean;
	rightSidebarContent: ReactNode | null;
	toggleRightSidebar: () => void;
	openRightSidebar: (content: ReactNode) => void;
	closeRightSidebar: () => void;
	setRightSidebarContent: (content: ReactNode | null) => void;

	isMobile: boolean;
}

const ShellContext = createContext<ShellContextValue | null>(null);

const MOBILE_BREAKPOINT = 1024;

export function ShellProvider({ children }: PropsWithChildren) {
	const pathname = usePathname();
	const initialPathRef = useRef(pathname);

	const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
	const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
	const [rightSidebarContent, setRightSidebarContent] =
		useState<ReactNode | null>(null);
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
		check();
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, []);

	useEffect(() => {
		if (isMobile) setLeftSidebarOpen(false);
		else setLeftSidebarOpen(true);
	}, [isMobile]);

	useEffect(() => {
		if (pathname !== initialPathRef.current) {
			setRightSidebarOpen(false);
			if (isMobile) setLeftSidebarOpen(false);
		}
		initialPathRef.current = pathname;
	}, [pathname, isMobile]);

	const toggleLeftSidebar = useCallback(
		() => setLeftSidebarOpen((prev) => !prev),
		[],
	);

	const toggleRightSidebar = useCallback(
		() =>
			setRightSidebarOpen((prev) => {
				if (!prev && !rightSidebarContent) return false;
				return !prev;
			}),
		[rightSidebarContent],
	);

	const openRightSidebar = useCallback((content: ReactNode) => {
		setRightSidebarContent(content);
		setRightSidebarOpen(true);
	}, []);

	const closeRightSidebar = useCallback(() => {
		setRightSidebarOpen(false);
	}, []);

	return (
		<ShellContext.Provider
			value={{
				leftSidebarOpen,
				toggleLeftSidebar,
				setLeftSidebarOpen,
				rightSidebarOpen,
				rightSidebarContent,
				toggleRightSidebar,
				openRightSidebar,
				closeRightSidebar,
				setRightSidebarContent,
				isMobile,
			}}
		>
			{children}
		</ShellContext.Provider>
	);
}

export function useShell() {
	const ctx = useContext(ShellContext);
	if (!ctx) throw new Error("useShell must be used within ShellProvider");
	return ctx;
}

export function useRightSidebar() {
	const {
		openRightSidebar,
		closeRightSidebar,
		setRightSidebarContent,
		rightSidebarOpen,
		toggleRightSidebar,
	} = useShell();
	return {
		open: openRightSidebar,
		close: closeRightSidebar,
		toggle: toggleRightSidebar,
		setContent: setRightSidebarContent,
		isOpen: rightSidebarOpen,
	};
}
