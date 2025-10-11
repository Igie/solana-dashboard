import React from 'react'
import { tabs } from '../../config/tabs'

interface NavigationProps {
  activeTab: string
  onTabChange: (id: string) => void
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <nav className="hidden lg:flex space-x-1">
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center px-2 py-1 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id
                ? 'bg-purple-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
          >
            <Icon className="w-4 h-4 mr-2" />
            {tab.name}
          </button>
        )
      })}
    </nav>
  )
}

export const MobileNavigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <nav className="lg:hidden fixed bottom-0 w-full bg-gray-900 border-t border-gray-700 flex justify-around py-2">
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center text-xs ${activeTab === tab.id ? 'text-purple-500' : 'text-gray-400'
              }`}
          >
            <Icon className="w-5 h-5 mb-1" />
            {tab.name}
          </button>
        )
      })}
    </nav>
  )
}
