// src/components/mypage/LogoutConfirmDialog.tsx
'use client';

import { ConfirmDialog } from '@toss/tds-mobile';

interface Props {
  open: boolean;
  isLoggedIn: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function LogoutConfirmDialog({
  open,
  isLoggedIn,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <ConfirmDialog
      open={open}
      title={isLoggedIn ? '회원탈퇴하시겠습니까?' : '데이터를 초기화하시겠습니까?'}
      description={isLoggedIn ? '저장된 데이터가 모두 삭제되며 복구할 수 없습니다.' : undefined}
      closeOnDimmerClick
      onClose={onCancel}
      cancelButton={
        <ConfirmDialog.CancelButton variant="weak" onClick={onCancel}>
          취소
        </ConfirmDialog.CancelButton>
      }
      confirmButton={
        <ConfirmDialog.ConfirmButton onClick={onConfirm}>
          {isLoggedIn ? '탈퇴하기' : '확인'}
        </ConfirmDialog.ConfirmButton>
      }
    />
  );
}
