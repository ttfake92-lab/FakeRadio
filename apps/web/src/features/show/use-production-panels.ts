import { useCallback, useState } from "react";

export type PanelId = "productionBoard" | "generationConsole" | "exportQueue" | "settings" | "showLibrary";

export type PanelState = {
  isOpen: boolean;
  isExpanded: boolean;
};

export type ProductionPanelsState = {
  productionBoard: PanelState;
  generationConsole: PanelState;
  exportQueue: PanelState;
  settings: PanelState;
  showLibrary: PanelState;
};

const defaultPanelState: PanelState = {
  isOpen: false,
  isExpanded: false,
};

const initialState: ProductionPanelsState = {
  productionBoard: { ...defaultPanelState },
  generationConsole: { ...defaultPanelState },
  exportQueue: { ...defaultPanelState },
  settings: { ...defaultPanelState },
  showLibrary: { ...defaultPanelState },
};

export function useProductionPanels() {
  const [panels, setPanels] = useState<ProductionPanelsState>(initialState);

  const openPanel = useCallback((panelId: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [panelId]: {
        isOpen: true,
        isExpanded: true,
      },
    }));
  }, []);

  const closePanel = useCallback((panelId: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [panelId]: {
        isOpen: false,
        isExpanded: false,
      },
    }));
  }, []);

  const togglePanel = useCallback((panelId: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [panelId]: {
        isOpen: !prev[panelId].isOpen,
        isExpanded: !prev[panelId].isOpen ? true : prev[panelId].isExpanded,
      },
    }));
  }, []);

  const expandPanel = useCallback((panelId: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [panelId]: {
        ...prev[panelId],
        isExpanded: true,
      },
    }));
  }, []);

  const collapsePanel = useCallback((panelId: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [panelId]: {
        ...prev[panelId],
        isExpanded: false,
      },
    }));
  }, []);

  const closeAllPanels = useCallback(() => {
    setPanels(initialState);
  }, []);

  return {
    panels,
    openPanel,
    closePanel,
    togglePanel,
    expandPanel,
    collapsePanel,
    closeAllPanels,
  };
}
