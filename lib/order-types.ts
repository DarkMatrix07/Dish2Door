import type { Prisma } from "@prisma/client";
import { orderInclude } from "@/lib/order-select";

export type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
