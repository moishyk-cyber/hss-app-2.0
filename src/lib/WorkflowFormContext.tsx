"use client";
import { createContext, useContext } from "react";
const WorkflowFormCompletion = createContext<(() => void) | null>(null);
export const WorkflowFormCompletionProvider = WorkflowFormCompletion.Provider;
export const useWorkflowFormCompletion = () => useContext(WorkflowFormCompletion);
