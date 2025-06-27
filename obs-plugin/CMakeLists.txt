cmake_minimum_required(VERSION 3.16...3.26)

project(meetingmind-plugin VERSION 1.0.0)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(libobs REQUIRED)
find_package(Qt6 REQUIRED COMPONENTS Core Widgets Network WebSockets)

# Plugin configuration
set(PLUGIN_AUTHOR "MeetingMind Team")
set(PLUGIN_GIT meetingmind-obs-plugin)
set(MACOS_BUNDLEID "com.meetingmind.obs-plugin")
set(MACOS_PACKAGE_UUID "A1B2C3D4-E5F6-7890-ABCD-123456789012")
set(MACOS_INSTALLER_UUID "B2C3D4E5-F6G7-8901-BCDE-234567890123")
set(LINUX_MAINTAINER_EMAIL "support@meetingmind.com")

# Set module properties
set_target_properties_plugin(meetingmind-plugin PROPERTIES OUTPUT_NAME meetingmind-plugin)

# Plugin sources
target_sources(
  meetingmind-plugin
  PRIVATE 
    src/meetingmind-plugin.cpp
    src/meetingmind-plugin.hpp
)

# Include directories
target_include_directories(meetingmind-plugin PRIVATE src)

# Link libraries
target_link_libraries(
  meetingmind-plugin 
  PRIVATE 
    OBS::libobs
    OBS::frontend-api
    Qt6::Core
    Qt6::Widgets
    Qt6::Network
    Qt6::WebSockets
)

# Enable Qt MOC
set_target_properties(meetingmind-plugin PROPERTIES AUTOMOC ON)

# Compiler-specific options
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(meetingmind-plugin PRIVATE -Wall -Wextra)
endif()

# Setup plugin with OBS
setup_plugin_target(meetingmind-plugin)