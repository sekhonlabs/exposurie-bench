import { Router } from 'express';
import { requireOrgAccess } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rateLimit';
import { archiveProject, createProject, getProject, listProjects, updateProject } from '../../services/projects';

export const projects = Router({ mergeParams: true });

projects.use(requireOrgAccess, rateLimit);

const STATUS = { active: 'ACTIVE', archived: 'ARCHIVED' } as const;

projects.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 50));
  const status = req.query.status === 'all' ? undefined : STATUS[req.query.status === 'archived' ? 'archived' : 'active'];
  const { items, total } = await listProjects(res.locals.organizationId, { page, pageSize, status });
  res.json({ items, page, page_size: pageSize, total });
});

projects.post('/', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(422).json({ error: 'name_required' });
    return;
  }
  const project = await createProject(res.locals.organizationId, { name, description: req.body.description ?? null });
  res.status(201).json(project);
});

projects.get('/:projectId', async (req, res) => {
  const project = await getProject(res.locals.organizationId, req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(project);
});

projects.patch('/:projectId', async (req, res) => {
  const changes: { name?: string; description?: string | null } = {};
  if (req.body?.name !== undefined) {
    if (typeof req.body.name !== 'string' || !req.body.name.trim()) {
      res.status(422).json({ error: 'name_required' });
      return;
    }
    changes.name = req.body.name;
  }
  if (req.body?.description !== undefined) changes.description = req.body.description;
  const project = await updateProject(res.locals.organizationId, req.params.projectId, changes);
  if (!project) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(project);
});

projects.post('/:projectId/archive', async (req, res) => {
  const project = await archiveProject(res.locals.organizationId, req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(project);
});
