-- Công văn đi: thêm hình thức + đơn vị vận chuyển.
ALTER TABLE "OutgoingDocument" ADD COLUMN "transportMethod" TEXT;
ALTER TABLE "OutgoingDocument" ADD COLUMN "transportUnit" TEXT;
