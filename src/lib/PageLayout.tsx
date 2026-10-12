import { BackLink } from "./BackLink";
import type { ReactNode } from "react";

/** Shared page composition; modules provide content, never reinvent the chrome. */
export function PageHeader({
  title,
  subtitle,
  children,
  toolbar,
  level = 1,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  toolbar?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className={`page-header ${toolbar ? "collection-header" : ""}`}>
      <div className="collection-heading min-w-0">
        {toolbar && <><span className="collection-workspace">HSS Kitchens</span><span className="collection-divider" aria-hidden="true">/</span></>}
        <Heading className="page-title">{title}</Heading>
        {subtitle && (
          <p className={`page-sub ${toolbar ? "sr-only" : ""}`}>{subtitle}</p>
        )}
      </div>
      {toolbar}
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
export function DetailHeader({
  backHref,
  backLabel,
  title,
  subtitle,
  badges,
  action,
  secondary,
  avatar,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  action?: ReactNode;
  secondary?: ReactNode;
  avatar?: ReactNode;
}) {
  return (
    <header className="detail-header">
      <BackLink href={backHref} label={backLabel} />
      <div className="page-header">
        <div className="detail-heading min-w-0">
          <div className="flex items-start gap-3">
            {avatar}
            <div className="min-w-0">
              <h1 className="page-title break-words">{title}</h1>
              {subtitle && <p className="page-sub">{subtitle}</p>}
            </div>
          </div>
        </div>
        {(action || secondary) && (
          <div className="page-actions">
            {secondary}
            {action}
          </div>
        )}
        {badges && <div className="detail-badges">{badges}</div>}
      </div>
    </header>
  );
}
export function FormFooter({ children }: { children: ReactNode }) {
  return <div className="form-footer">{children}</div>;
}
