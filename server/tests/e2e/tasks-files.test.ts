import { describe, expect, it } from 'vitest';
import { asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { makePdf } from '../helpers/files';

const newTask = async (agent: Awaited<ReturnType<typeof asStaff>>['agent'], body: Record<string, unknown> = {}) =>
  (await agent.post('/api/tasks').send({ title: 'Xarici prava', ...body }).expect(201)).body.task as { id: string; number: number };

describe('task files uploaded from the computer', () => {
  it('stores the file in the company drive task folder, links it and lets every staff member download it', async () => {
    const creator = await asStaff();
    const colleague = await asStaff();
    const task = await newTask(creator.agent);

    const res = await creator.agent
      .post(`/api/tasks/${task.id}/files`)
      .attach('file', await makePdf('passport'), { filename: 'pasport.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(res.body.task.attachments).toHaveLength(1);
    const att = res.body.task.attachments[0];
    expect(att).toMatchObject({ name: 'pasport.pdf', kind: 'FILE', accessible: true });

    const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: att.nodeId }, include: { parent: { include: { parent: true } } } });
    expect(node.space).toBe('SHARED');
    expect(node.parent?.name).toMatch(/^T-\d{4} · Xarici prava$/);
    expect(node.parent?.parent).toMatchObject({ name: 'Aufgabendateien', system: true });

    // a second upload reuses the same task folder, a same-named file gets a free name
    const again = await creator.agent
      .post(`/api/tasks/${task.number}/files`)
      .attach('file', await makePdf('passport 2'), { filename: 'pasport.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(again.body.task.attachments).toHaveLength(2);
    expect(await prisma.driveNode.count({ where: { name: { startsWith: `T-${String(task.number).padStart(4, '0')}` } } })).toBe(1);

    // every staff member can open the task and download the file
    const detail = await colleague.agent.get(`/api/tasks/${task.id}`).expect(200);
    expect(detail.body.task.attachments.every((a: { accessible: boolean }) => a.accessible)).toBe(true);
    await colleague.agent.get(`/api/drive/nodes/${att.nodeId}/content?download=1`).expect(200);
  });

  it('only people who work on the task may upload, and bad files are refused', async () => {
    const creator = await asStaff();
    const outsider = await asStaff();
    const task = await newTask(creator.agent);

    await outsider.agent
      .post(`/api/tasks/${task.id}/files`)
      .attach('file', await makePdf('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(403);

    const fake = await creator.agent
      .post(`/api/tasks/${task.id}/files`)
      .attach('file', Buffer.from('not really a pdf'), { filename: 'fake.pdf', contentType: 'application/pdf' });
    expect(fake.status).toBe(400);

    const exe = await creator.agent
      .post(`/api/tasks/${task.id}/files`)
      .attach('file', Buffer.from('MZ....'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
    expect(exe.status).toBe(400);
    expect(await prisma.taskAttachment.count({ where: { taskId: task.id } })).toBe(0);
  });
});
