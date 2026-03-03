export default function Footer() {
  return (
    <footer className="flex h-16 items-center justify-center border-t text-sm text-zinc-500">
      &copy; {new Date().getFullYear()} Octopilot AI. All rights reserved.
    </footer>
  );
}
