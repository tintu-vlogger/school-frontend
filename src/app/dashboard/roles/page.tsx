"use client";

/*
 * Roles & access: what each role can see and do (Roles tab), and who has which roles
 * (People tab). Add, edit and view a role in a modal over the list.
 */
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Lock, Plus, ShieldCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { useUrlTab } from "@/lib/use-url-tab";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Button, Tabs } from "@/components/ui-kit";
import { RoleEditor } from "@/components/roles/role-editor";
import { RoleList } from "@/components/roles/role-list";
import { PeopleRoles } from "@/components/roles/people-roles";
import { errorText, isForbidden, type Catalog, type Role } from "@/components/roles/types";

const TABS = ["roles", "people"] as const;
type Tab = (typeof TABS)[number];

export default function RolesPage() {
  const toast = useToast();
  const [tab, setTabState] = useState<Tab>("roles");
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [editor, setEditorState] = useState<{ role: Role | null; open: boolean }>({ role: null, open: false });
  const setEditor = (v: { role: Role | null } | null) => setEditorState((cur) => (v ? { role: v.role, open: true } : { ...cur, open: false }));

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    const url = new URL(window.location.href);
    if (t === "roles") url.searchParams.delete("tab"); else url.searchParams.set("tab", t);
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);
  useUrlTab(TABS, setTabState);

  const loadRoles = useCallback(async () => {
    try {
      setRoles(await api.get<Role[]>("/roles/"));
    } catch (e) {
      if (isForbidden(e)) setForbidden(true);
      else toast.error(errorText(e, "Couldn't load roles"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRoles();
    api.get<Catalog>("/roles/catalog").then(setCatalog).catch((e) => { if (isForbidden(e)) setForbidden(true); });
  }, [loadRoles]);

  const header = (
    <PageHeader
      eyebrow="Settings"
      title="Roles & access"
      description="Decide what each role can see and do, then give people the roles they need."
      actions={!forbidden && tab === "roles" && (
        <Button variant="primary" icon={Plus} onClick={() => setEditor({ role: null })} disabled={!catalog}>New role</Button>
      )}
    />
  );

  if (forbidden) {
    return (
      <div>
        {header}
        <Paper>
          <EmptyState icon={Lock} title="You can't manage roles"
            hint="Only people with the “Manage roles and access” permission can open this page. Ask an HR admin if you need it." />
        </Paper>
      </div>
    );
  }

  return (
    <div>
      {header}
      <Tabs<Tab> value={tab} onChange={setTab} className="mb-5"
        items={[
          { value: "roles", label: "Roles", icon: ShieldCheck, count: loading ? undefined : roles.length },
          { value: "people", label: "People", icon: Users },
        ]} />

      {tab === "roles" && (
        <>
          <RoleList roles={roles} loading={loading}
            onOpen={(r) => setEditor({ role: r })}
            onChanged={loadRoles}
            onCloned={(r) => { loadRoles(); setEditor({ role: r }); }} />
          {!loading && roles.length > 0 && (
            <p className="mt-5 flex items-start gap-2 text-[13px] text-faint">
              <KeyRound size={14} strokeWidth={1.4} className="mt-0.5 shrink-0" />
              Someone with several roles gets everything those roles allow together. System roles can be changed and reset, but not deleted.
            </p>
          )}
        </>
      )}

      {tab === "people" && <PeopleRoles roles={roles} onRolesChanged={loadRoles} />}

      {catalog && (
        <RoleEditor open={editor.open} role={editor.role} catalog={catalog}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); loadRoles(); }} />
      )}
    </div>
  );
}
