import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  TrendingUp,
  TrendingDown,
  Info,
  ChevronRight,
  Eye,
  Filter,
  Search,
  ExternalLink
} from 'lucide-react';

interface OverviewTile {
  id: string;
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ComponentType<any>;
  color: string;
  bgColor: string;
  trend?: {
    direction: 'up' | 'down';
    value: string;
  };
  clickable: boolean;
  data?: any[];
}

interface OverviewSectionProps {
  analysisData: any;
  onTileClick: (tileId: string, data?: any[]) => void;
}

const OverviewSection: React.FC<OverviewSectionProps> = ({
  analysisData,
  onTileClick
}) => {
  const [selectedTile, setSelectedTile] = useState<string | null>(null);

  const tiles: OverviewTile[] = [
    {
      id: 'total_dependencies',
      title: 'Total Dependencies',
      value: analysisData?.summary?.total_dependencies || 0,
      subtitle: 'All discovered dependencies',
      icon: Package,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      clickable: true,
      data: analysisData?.dependencies || []
    },
    {
      id: 'direct_dependencies',
      title: 'Direct Dependencies',
      value: analysisData?.summary?.direct_dependencies || 0,
      subtitle: 'Explicitly declared',
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      clickable: true,
      data: analysisData?.dependencies?.filter((dep: any) => !dep.is_transitive) || []
    },
    {
      id: 'transitive_dependencies',
      title: 'Transitive Dependencies',
      value: analysisData?.summary?.transitive_dependencies || 0,
      subtitle: 'Inherited from direct deps',
      icon: TrendingUp,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      clickable: true,
      data: analysisData?.dependencies?.filter((dep: any) => dep.is_transitive) || []
    },
    {
      id: 'conflicts',
      title: 'Conflicts',
      value: analysisData?.summary?.conflicts_count || 0,
      subtitle: 'Version conflicts detected',
      icon: AlertTriangle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      trend: analysisData?.summary?.conflicts_count > 0 ? {
        direction: 'up' as const,
        value: 'Needs attention'
      } : undefined,
      clickable: true,
      data: analysisData?.conflicts || []
    }
  ];

  const handleTileClick = (tile: OverviewTile) => {
    if (!tile.clickable) return;
    
    setSelectedTile(tile.id);
    onTileClick(tile.id, tile.data);
    
    // Reset selection after animation
    setTimeout(() => setSelectedTile(null), 200);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Dependency Overview
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Click on any tile to explore detailed information
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
            <Info className="h-3 w-3 mr-1" />
            Interactive
          </span>
        </div>
      </div>

      {/* Tiles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const TrendIcon = tile.trend?.direction === 'up' ? TrendingUp : TrendingDown;
          
          return (
            <motion.div
              key={tile.id}
              whileHover={{ scale: tile.clickable ? 1.02 : 1, y: tile.clickable ? -2 : 0 }}
              whileTap={{ scale: tile.clickable ? 0.98 : 1 }}
              animate={{
                scale: selectedTile === tile.id ? 0.95 : 1,
                boxShadow: selectedTile === tile.id 
                  ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                  : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
              }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`
                relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 
                bg-white dark:bg-gray-800 p-6 shadow-sm
                ${tile.clickable ? 'cursor-pointer hover:shadow-lg' : ''}
                transition-all duration-200
              `}
              onClick={() => handleTileClick(tile)}
            >
              {/* Background Pattern */}
              <div className={`absolute top-0 right-0 w-20 h-20 ${tile.bgColor} rounded-full -mr-10 -mt-10 opacity-50`} />
              
              {/* Content */}
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${tile.bgColor}`}>
                        <Icon className={`h-6 w-6 ${tile.color}`} />
                      </div>
                      {tile.clickable && (
                        <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      )}
                    </div>
                    
                    <div className="mt-4">
                      <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {tile.title}
                      </h3>
                      <div className="flex items-baseline space-x-2 mt-1">
                        <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                          {tile.value.toLocaleString()}
                        </span>
                        {tile.trend && (
                          <div className={`flex items-center space-x-1 ${
                            tile.trend.direction === 'up' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                          }`}>
                            <TrendIcon className="h-3 w-3" />
                            <span className="text-xs font-medium">{tile.trend.value}</span>
                          </div>
                        )}
                      </div>
                      {tile.subtitle && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {tile.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Click indicator */}
                {tile.clickable && (
                  <div className="absolute bottom-2 right-2">
                    <div className="flex items-center space-x-1 text-xs text-gray-400 dark:text-gray-500">
                      <Eye className="h-3 w-3" />
                      <span>View</span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scope Breakdown */}
        {analysisData?.summary?.scope_breakdown && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Dependency Scopes
            </h3>
            <div className="space-y-3">
              {Object.entries(analysisData.summary.scope_breakdown).map(([scope, count]) => (
                <div key={scope} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      scope === 'compile' ? 'bg-blue-500' :
                      scope === 'runtime' ? 'bg-green-500' :
                      scope === 'test' ? 'bg-yellow-500' :
                      scope === 'provided' ? 'bg-purple-500' :
                      'bg-gray-500'
                    }`} />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                      {scope}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {count as number}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Source Breakdown */}
        {analysisData?.summary?.source_breakdown && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Detection Sources
            </h3>
            <div className="space-y-3">
              {Object.entries(analysisData.summary.source_breakdown).map(([source, count]) => (
                <div key={source} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      source.includes('manifest') ? 'bg-blue-500' :
                      source.includes('pom') ? 'bg-red-500' :
                      source.includes('gradle') ? 'bg-green-500' :
                      source.includes('properties') ? 'bg-yellow-500' :
                      'bg-gray-500'
                    }`} />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {source.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {count as number}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => onTileClick('search', [])}
            className="inline-flex items-center px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Search className="h-4 w-4 mr-2" />
            Search Dependencies
          </button>
          <button
            onClick={() => onTileClick('filter', [])}
            className="inline-flex items-center px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filter Results
          </button>
          <button
            onClick={() => onTileClick('export', [])}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Export Analysis
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverviewSection;
