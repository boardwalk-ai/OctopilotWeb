import "./verify.css";

export default function VerifyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="ov" data-theme="octo-verify">
      {children}
    </div>
  );
}
