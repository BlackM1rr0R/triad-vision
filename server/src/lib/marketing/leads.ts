import { prisma } from '../../db.js';
import { attachLeadContext, rescoreInquiry, visitorIdSchema } from './leadScoring.js';
import { visitorDid } from './visitors.js';

/**
 * A consultation was booked. Bookings are not inquiries, but they are the strongest buying signal: the
 * visitor's "booking_done" counter goes up and the person's lead (the visitor's inquiry, else the latest
 * inquiry with the same e-mail) is linked to the visitor and rescored. Never throws.
 */
export const onBookingLead = async (booking: { email: string }, visitorId?: string | null) => {
  try {
    const vid = visitorId && visitorIdSchema.safeParse(visitorId).success ? visitorId : null;
    // visitorDid rescores an inquiry the visitor is already linked to.
    const visitor = vid ? await visitorDid(vid, 'booking_done') : null;
    if (visitor?.inquiryId) return null;
    const match = await prisma.inquiry.findFirst({
      where: { email: booking.email.toLowerCase(), status: { in: ['NEW', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!match) return null;
    return vid ? await attachLeadContext(match.id, { visitorId: vid }) : await rescoreInquiry(match.id);
  } catch (err) {
    console.error('[leads] booking hook failed', err);
    return null;
  }
};
