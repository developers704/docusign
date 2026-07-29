"use client";

import { useState } from "react";
import { Icon } from "@/components/Icons";
import type { OfficeRecord, UserRecord } from "@/lib/types";

type ServerAction = (formData: FormData) => Promise<void>;

function roleLabel(role: UserRecord["role"]) {
  if (role === "office_admin") return "Office Admin";
  if (role === "office_user") return "Office User";
  return "Viewer";
}

export default function TeamWorkspace({
  users,
  offices,
  officeNames,
  canInvite,
  defaultOfficeId,
  allowOfficeSelection,
  inviteAction,
  toggleUserAction,
  resetPasswordAction,
}: {
  users: UserRecord[];
  offices: OfficeRecord[];
  officeNames: Record<string, string>;
  canInvite: boolean;
  defaultOfficeId: string;
  allowOfficeSelection: boolean;
  inviteAction: ServerAction;
  toggleUserAction: ServerAction;
  resetPasswordAction: ServerAction;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);

  return (
    <>
      <div className="border-b border-[#e6e6ec] px-6 py-6 sm:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-[#6b6578]">Access control</p>
            <h1 className="mt-1 text-[32px] font-normal tracking-[-.02em] text-[#21004c]">Team & roles</h1>
            <p className="mt-2 text-sm text-[#6b6578]">Manage portal users, office membership and access levels.</p>
          </div>
          {canInvite && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#21004c] px-4 text-sm font-bold text-white hover:bg-[#3d00cf]"
            >
              <Icon name="plus" className="h-4 w-4" />
              Invite member
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 border-b border-[#e6e6ec] px-6 py-5 sm:grid-cols-3 sm:px-8">
        {[
          ["Active members", users.filter((u) => u.isActive).length],
          ["Administrators", users.filter((u) => u.role === "office_admin").length],
          ["Office workspaces", allowOfficeSelection ? offices.length : 1],
        ].map(([label, value]) => (
          <article key={String(label)} className="rounded-md border border-[#e6e6ec] bg-white p-4">
            <p className="text-2xl font-light text-[#21004c]">{value}</p>
            <p className="mt-1 text-sm font-semibold text-[#6b6578]">{label}</p>
          </article>
        ))}
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-[#e6e6ec] text-[11px] font-bold uppercase tracking-[.08em] text-[#6b6578]">
              <th className="px-6 py-3">Member</th>
              <th className="px-4 py-3">Office</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ececf1]">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-sm text-[#6b6578]">
                  No office members yet. Use Invite member to add the first account.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-[#fafafa]">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e9e1ff] text-[11px] font-extrabold text-[#4c00ff]">
                        {user.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[#21004c]">{user.name}</p>
                        <p className="text-xs text-[#6b6578]">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-[#3d3848]">{officeNames[user.officeId] || "Office"}</td>
                  <td className="px-4 py-4 text-sm text-[#3d3848]">{roleLabel(user.role)}</td>
                  <td className="px-4 py-4 text-xs text-[#6b6578]">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        user.isActive ? "bg-[#ddf8e9] text-[#087a4a]" : "bg-[#eeeaf0] text-[#716678]"
                      }`}
                    >
                      {user.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="relative px-6 py-4 text-right">
                    {canInvite ? (
                      <>
                        <button
                          type="button"
                          aria-label={`Actions for ${user.name}`}
                          onClick={() => setMenuUserId((current) => (current === user.id ? null : user.id))}
                          className="rounded-md p-2 hover:bg-[#f0f0f4]"
                        >
                          <Icon name="more" className="h-5 w-5 text-[#6b6578]" />
                        </button>
                        {menuUserId === user.id && (
                          <div className="absolute right-6 z-20 mt-1 w-56 rounded-md border border-[#e0e0e8] bg-white p-2 text-left shadow-lg">
                            <form action={toggleUserAction} className="block">
                              <input type="hidden" name="userId" value={user.id} />
                              <button
                                type="submit"
                                className="w-full rounded px-3 py-2 text-left text-sm font-semibold text-[#21004c] hover:bg-[#f5f5f7]"
                              >
                                {user.isActive ? "Disable account" : "Enable account"}
                              </button>
                            </form>
                            <form action={resetPasswordAction} className="mt-1 space-y-2 border-t border-[#ececf1] pt-2">
                              <input type="hidden" name="userId" value={user.id} />
                              <input
                                name="password"
                                type="password"
                                minLength={8}
                                required
                                placeholder="New password (8+)"
                                className="h-9 w-full rounded-md border border-[#c8c8d3] px-2 text-xs outline-none focus:border-[#21004c]"
                              />
                              <button
                                type="submit"
                                className="w-full rounded bg-[#21004c] px-3 py-2 text-xs font-bold text-white"
                              >
                                Reset password
                              </button>
                            </form>
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-[#9a94a6]">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2a0a3d]/45 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#e8e8e8] px-5 py-4">
              <h2 className="text-lg font-semibold text-[#21004c]">Invite member</h2>
              <button type="button" aria-label="Close" onClick={() => setInviteOpen(false)} className="h-8 w-8 rounded hover:bg-[#f2f2f2]">
                ×
              </button>
            </div>
            <form
              action={async (formData) => {
                await inviteAction(formData);
                setInviteOpen(false);
              }}
              className="space-y-3 p-5"
            >
              {allowOfficeSelection ? (
                <label className="block text-sm font-semibold text-[#21004c]">
                  Office
                  <select
                    name="officeId"
                    required
                    defaultValue={defaultOfficeId}
                    className="mt-1 h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
                  >
                    {offices.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <input type="hidden" name="officeId" value={defaultOfficeId} />
              )}
              <label className="block text-sm font-semibold text-[#21004c]">
                Full name
                <input
                  name="name"
                  required
                  placeholder="Jane Doe"
                  className="mt-1 h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
                />
              </label>
              <label className="block text-sm font-semibold text-[#21004c]">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="jane@office.com"
                  className="mt-1 h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
                />
              </label>
              <label className="block text-sm font-semibold text-[#21004c]">
                Temporary password
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  placeholder="At least 8 characters"
                  className="mt-1 h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
                />
              </label>
              <label className="block text-sm font-semibold text-[#21004c]">
                Role
                <select
                  name="role"
                  defaultValue="office_user"
                  className="mt-1 h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
                >
                  <option value="office_admin">Office Admin</option>
                  <option value="office_user">Office User (can send)</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
              <p className="text-xs text-[#6b6578]">
                Account is created immediately. Share the email and temporary password so they can sign in at the login page.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setInviteOpen(false)} className="h-10 px-4 text-sm font-semibold text-[#21004c]">
                  Cancel
                </button>
                <button type="submit" className="h-10 rounded-md bg-[#4c00ff] px-4 text-sm font-bold text-white hover:bg-[#3d00cf]">
                  Create member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
