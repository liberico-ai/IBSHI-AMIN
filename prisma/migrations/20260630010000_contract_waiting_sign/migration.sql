-- Trạng thái HĐ "Đợi ký": phát hành HĐ → chờ NV ký ngoài → xác nhận đã ký (upload scan) mới hiệu lực.
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'WAITING_SIGN';
