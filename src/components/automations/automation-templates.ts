import {
  AnalyticsUpIcon,
  Bug02Icon,
  CleaningBucketIcon,
  DashboardSpeed01Icon,
  DocumentValidationIcon,
  NoteEditIcon,
  SecurityLockIcon,
  TestTube01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import type { CreateAutomationInput } from "@/schemas/automation.schema";

export type AutomationTemplate = {
  id: string;
  title: string;
  description: string;
  icon: IconSvgElement;
  defaults: Omit<CreateAutomationInput, "title"> & { title: string };
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "code-review",
    title: "Daily Code Review",
    description:
      "Review recent changes for quality, consistency, and potential issues.",
    icon: DocumentValidationIcon,
    defaults: {
      title: "Daily Code Review",
      prompt:
        "Review the most recent code changes in this project. Look for code quality issues, inconsistencies, potential bugs, and suggest improvements. Focus on readability, maintainability, and adherence to best practices.",
      scheduleType: "daily",
      scheduleTime: "09:00",
    },
  },
  {
    id: "performance-audit",
    title: "Performance Audit",
    description:
      "Analyze code for performance bottlenecks and optimization opportunities.",
    icon: DashboardSpeed01Icon,
    defaults: {
      title: "Performance Audit",
      prompt:
        "Audit this project for performance issues. Identify slow database queries, unnecessary re-renders, large bundle sizes, unoptimized assets, and memory leaks. Provide actionable recommendations with priority levels.",
      scheduleType: "weekly",
      scheduleTime: "08:00",
      scheduleDayOfWeek: 1,
    },
  },
  {
    id: "security-scan",
    title: "Security Scan",
    description:
      "Check for security vulnerabilities, outdated dependencies, and misconfigurations.",
    icon: SecurityLockIcon,
    defaults: {
      title: "Security Scan",
      prompt:
        "Perform a security review of this project. Check for known vulnerabilities in dependencies, hardcoded secrets, insecure API endpoints, missing input validation, SQL injection risks, and CORS misconfigurations. Flag any issues by severity.",
      scheduleType: "daily",
      scheduleTime: "07:00",
    },
  },
  {
    id: "test-coverage",
    title: "Test Coverage Report",
    description: "Identify untested code paths and suggest missing test cases.",
    icon: TestTube01Icon,
    defaults: {
      title: "Test Coverage Report",
      prompt:
        "Analyze the test coverage of this project. Identify critical code paths that lack tests, edge cases that are not covered, and modules with insufficient test coverage. Suggest specific test cases to improve reliability.",
      scheduleType: "weekly",
      scheduleTime: "10:00",
      scheduleDayOfWeek: 5,
    },
  },
  {
    id: "bug-triage",
    title: "Bug Triage",
    description:
      "Scan for potential bugs, anti-patterns, and error-prone code.",
    icon: Bug02Icon,
    defaults: {
      title: "Bug Triage",
      prompt:
        "Scan the codebase for potential bugs and anti-patterns. Look for unhandled promise rejections, race conditions, null pointer risks, off-by-one errors, and type mismatches. Prioritize findings by impact and likelihood.",
      scheduleType: "weekdays",
      scheduleTime: "08:30",
    },
  },
  {
    id: "documentation-check",
    title: "Documentation Check",
    description: "Find outdated or missing documentation across the project.",
    icon: NoteEditIcon,
    defaults: {
      title: "Documentation Check",
      prompt:
        "Review the project documentation. Identify functions, APIs, and modules that are missing documentation or have outdated docs. Check that README files accurately reflect the current state of the project and suggest improvements.",
      scheduleType: "weekly",
      scheduleTime: "14:00",
      scheduleDayOfWeek: 3,
    },
  },
  {
    id: "dependency-audit",
    title: "Dependency Audit",
    description:
      "Review project dependencies for updates, deprecations, and conflicts.",
    icon: AnalyticsUpIcon,
    defaults: {
      title: "Dependency Audit",
      prompt:
        "Audit the project dependencies. Identify outdated packages, deprecated APIs, version conflicts, and packages with known vulnerabilities. Recommend which dependencies should be updated and flag any breaking changes to watch for.",
      scheduleType: "weekly",
      scheduleTime: "09:00",
      scheduleDayOfWeek: 1,
    },
  },
  {
    id: "code-cleanup",
    title: "Code Cleanup",
    description:
      "Detect dead code, unused imports, and opportunities to simplify.",
    icon: CleaningBucketIcon,
    defaults: {
      title: "Code Cleanup",
      prompt:
        "Scan this project for cleanup opportunities. Find dead code, unused imports, unreachable branches, duplicated logic, and overly complex functions that could be simplified. Provide a prioritized list of cleanup tasks.",
      scheduleType: "weekly",
      scheduleTime: "11:00",
      scheduleDayOfWeek: 5,
    },
  },
];
