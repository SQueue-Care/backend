import { QueueStatus, VisitStage } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { visitStageAfterPayment } from "./visit-flow";

export async function advanceQueueAfterPayment(queueId: string) {
  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    include: { bill: { select: { status: true } } },
  });
  if (!queue || queue.status !== QueueStatus.DONE) return;

  const nextStage = visitStageAfterPayment(queue);
  const now = new Date();
  await prisma.queue.update({
    where: { id: queueId },
    data: {
      currentVisitStage: nextStage,
      visitCompletedAt: nextStage === VisitStage.COMPLETE ? now : null,
    },
  });
}
