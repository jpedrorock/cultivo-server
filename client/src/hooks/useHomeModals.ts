import { useState } from "react";

export function useHomeModals() {
  const [cycleModalOpen, setCycleModalOpen] = useState(false);
  const [selectedTent, setSelectedTent] = useState<{ id: number; name: string } | null>(null);
  const [initiateModalOpen, setInitiateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<any>(null);
  const [createTentModalOpen, setCreateTentModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tentToDelete, setTentToDelete] = useState<{ id: number; name: string } | null>(null);
  const [editTentDialogOpen, setEditTentDialogOpen] = useState(false);
  const [tentToEdit, setTentToEdit] = useState<any>(null);
  const [showMoveAllPlants, setShowMoveAllPlants] = useState(false);
  const [targetTentId, setTargetTentId] = useState<string>("");
  const [deletePreviewTentId, setDeletePreviewTentId] = useState<number | null>(null);
  const [finalizeCycleConfirm, setFinalizeCycleConfirm] = useState<{
    open: boolean;
    cycleId: number | null;
    tentName: string;
  }>({ open: false, cycleId: null, tentName: "" });

  return {
    cycleModalOpen, setCycleModalOpen,
    selectedTent, setSelectedTent,
    initiateModalOpen, setInitiateModalOpen,
    editModalOpen, setEditModalOpen,
    selectedCycle, setSelectedCycle,
    createTentModalOpen, setCreateTentModalOpen,
    deleteDialogOpen, setDeleteDialogOpen,
    tentToDelete, setTentToDelete,
    editTentDialogOpen, setEditTentDialogOpen,
    tentToEdit, setTentToEdit,
    showMoveAllPlants, setShowMoveAllPlants,
    targetTentId, setTargetTentId,
    deletePreviewTentId, setDeletePreviewTentId,
    finalizeCycleConfirm, setFinalizeCycleConfirm,
  };
}
