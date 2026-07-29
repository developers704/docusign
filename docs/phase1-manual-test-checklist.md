# Phase 1 Manual Test Checklist

## Access and Permissions
- [ ] Viewer can open templates list but cannot create/update template.
- [ ] Office admin can create and manage templates only for own office.
- [ ] Super admin can create global template.
- [ ] Cross-office template mutation is blocked.

## Template Lifecycle
- [ ] Create draft template with role names.
- [ ] Duplicate template creates draft copy.
- [ ] Publish template works when validation passes.
- [ ] Archive template works.
- [ ] Restore archived template back to draft.

## Versioning
- [ ] Version history appears for each template.
- [ ] Restore previous version creates a new current version.
- [ ] Current version marker updates correctly.

## Template Documents (PDF)
- [ ] Upload valid PDF to template succeeds.
- [ ] Replace existing PDF succeeds.
- [ ] Invalid extension upload is rejected.
- [ ] Invalid MIME upload is rejected.
- [ ] Oversized upload is rejected.

## Roles / Assignment Foundation
- [ ] Move Up and Move Down reorder roles.
- [ ] No color-only role identification in role list actions.
- [ ] Template shows role, field, assignment counters.

## Compatibility
- [ ] Existing templates with legacy schema still render.
- [ ] Existing envelope creation flow still works.
- [ ] Existing signing flow remains unchanged.
- [ ] 5-recipient limit remains active in new envelope form.

