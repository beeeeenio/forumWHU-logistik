"use client";

import { userCreateAction, userUpdateAction } from "@/app/actions/users";
import { ROLES, ROLE_HELP, ROLE_LABEL, type Role } from "@/lib/roles";
import { ActionForm, SubmitButton } from "./action-form";

export function UserCreateForm() {
  return (
    <ActionForm action={userCreateAction} className="grid gap-3 sm:grid-cols-2">
      <label><span className="label">Name</span><input name="displayName" required maxLength={120} className="field" placeholder="Vorname Nachname" /></label>
      <label><span className="label">Microsoft-E-Mail</span><input name="email" type="email" required maxLength={200} className="field" placeholder="name@forumwhu.com" /></label>
      <label className="sm:col-span-2"><span className="label">Rolle</span>
        <select name="role" defaultValue="MEMBER" className="field">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]} – {ROLE_HELP[r]}</option>)}</select></label>
      <div className="sm:col-span-2"><SubmitButton>Person eintragen</SubmitButton></div>
    </ActionForm>
  );
}

export function UserRow({ id, role, deactivated, self }: { id: string; role: Role; deactivated: boolean; self: boolean }) {
  if (self) return <p className="text-xs text-muted-foreground">Das bist du – deine eigene Rolle und deinen Zugang kann nur ein anderer Administrator ändern.</p>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <ActionForm action={userUpdateAction} keepOnSuccess className="flex items-end gap-2">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="role" />
        <label><span className="label">Rolle</span><select name="role" defaultValue={role} className="field">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
        <SubmitButton className="btn-secondary btn-sm">Ändern</SubmitButton>
      </ActionForm>
      <ActionForm action={userUpdateAction} keepOnSuccess className="flex gap-2" confirm={deactivated ? undefined : "Zugang sperren? Die Person wird sofort abgemeldet."}>
        <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={deactivated ? "activate" : "deactivate"} />
        <SubmitButton className={deactivated ? "btn-secondary btn-sm" : "btn-danger btn-sm"}>{deactivated ? "Entsperren" : "Sperren"}</SubmitButton>
      </ActionForm>
      {!deactivated && (
        <ActionForm action={userUpdateAction} keepOnSuccess>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="signout" />
          <SubmitButton className="btn-secondary btn-sm">Überall abmelden</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
